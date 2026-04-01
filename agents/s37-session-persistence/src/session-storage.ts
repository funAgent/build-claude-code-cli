/**
 * s37 — 会话持久化
 *
 * 专业工具不会丢失你的工作。会话持久化让用户可以随时中断、随时恢复。
 *
 * 关键流程：
 * 1. 每条消息实时追加到 JSONL 文件
 * 2. session ID 唯一标识每次会话
 * 3. --resume 从 JSONL 文件恢复完整会话
 * 4. ResumeConversation 列出可恢复的历史会话
 *
 * 对照 Claude Code:
 * - utils/sessionStorage.ts (~400 行): JSONL 读写 + session 管理
 * - utils/sessionStoragePortable.ts: 跨平台工具函数
 * - utils/conversationRecovery.ts: resume 恢复逻辑
 * - screens/ResumeConversation.tsx: 会话选择 UI
 */

import { randomUUID } from "crypto";
import {
  mkdirSync,
  appendFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { createHash } from "crypto";
import type Anthropic from "@anthropic-ai/sdk";

// ── 类型定义 ─────────────────────────────────────────────────

export type SessionId = string & { readonly __brand: "SessionId" };

/**
 * 序列化的消息条目（带元数据）。
 * 对照 Claude Code: SerializedMessage
 */
export interface TranscriptEntry {
  type: "message";
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
  sessionId: SessionId;
  timestamp: string;
  cwd: string;
  uuid: string;
  parentUuid?: string;
}

/**
 * 元数据条目（会话标题、标签等）。
 */
export interface MetadataEntry {
  type: "metadata";
  key: string;
  value: unknown;
  sessionId: SessionId;
  timestamp: string;
}

type Entry = TranscriptEntry | MetadataEntry;

/**
 * 会话摘要（用于 resume 列表）。
 */
export interface SessionSummary {
  sessionId: SessionId;
  firstPrompt: string;
  messageCount: number;
  lastTimestamp: string;
  cwd: string;
}

// ── Session ID ───────────────────────────────────────────────

/**
 * 生成新的会话 ID。
 * 对照 Claude Code: bootstrap/state.ts → sessionId: randomUUID()
 */
export function generateSessionId(): SessionId {
  return randomUUID() as SessionId;
}

/**
 * 校验 session ID 格式（UUID v4）。
 * 对照 Claude Code: sessionStoragePortable.ts → isValidUUID
 */
export function isValidSessionId(id: string): id is SessionId {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// ── 存储路径 ─────────────────────────────────────────────────

/**
 * 计算项目目录哈希，用于会话文件路径。
 * 对照 Claude Code: getProjectDir → 项目路径哈希
 */
function getProjectHash(cwd: string): string {
  return createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 16);
}

function getSessionDir(cwd: string): string {
  const dir = join(homedir(), ".agent-cli", "projects", getProjectHash(cwd));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 获取会话文件路径。
 * 对照 Claude Code: getTranscriptPath
 */
export function getTranscriptPath(sessionId: SessionId, cwd: string): string {
  return join(getSessionDir(cwd), `${sessionId}.jsonl`);
}

// ── JSONL 写入 ───────────────────────────────────────────────

/**
 * 记录一条消息到 JSONL 转录文件。
 *
 * 对照 Claude Code: recordTranscript
 * - 通过 insertMessageChain 写入
 * - 带 UUID 去重 + parent 链
 * - 实时追加（appendFile）
 */
export function recordTranscript(
  sessionId: SessionId,
  message: Anthropic.MessageParam,
  cwd: string,
  parentUuid?: string,
): string {
  const uuid = randomUUID();

  const entry: TranscriptEntry = {
    type: "message",
    role: message.role,
    content: message.content,
    sessionId,
    timestamp: new Date().toISOString(),
    cwd,
    uuid,
    parentUuid,
  };

  const path = getTranscriptPath(sessionId, cwd);
  appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");

  return uuid;
}

/**
 * 记录元数据条目。
 */
export function recordMetadata(
  sessionId: SessionId,
  key: string,
  value: unknown,
  cwd: string,
): void {
  const entry: MetadataEntry = {
    type: "metadata",
    key,
    value,
    sessionId,
    timestamp: new Date().toISOString(),
  };

  const path = getTranscriptPath(sessionId, cwd);
  appendFileSync(path, JSON.stringify(entry) + "\n", "utf-8");
}

// ── JSONL 读取 ───────────────────────────────────────────────

/**
 * 从 JSONL 文件加载会话消息。
 *
 * 对照 Claude Code: loadTranscriptFile
 * - 构建 parentUuid 链
 * - 过滤孤儿消息
 * - 处理不完整的 JSON 行
 */
export function loadTranscript(
  sessionId: SessionId,
  cwd: string,
): Anthropic.MessageParam[] {
  const path = getTranscriptPath(sessionId, cwd);
  if (!existsSync(path)) return [];

  const content = readFileSync(path, "utf-8");
  const messages: Anthropic.MessageParam[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as Entry;
      if (entry.type === "message") {
        messages.push({ role: entry.role, content: entry.content });
      }
    } catch {
      // 跳过损坏的行（例如进程中断导致的不完整 JSON）
    }
  }

  return messages;
}

// ── 会话列表 ─────────────────────────────────────────────────

/**
 * 列出当前项目的所有可恢复会话。
 *
 * 对照 Claude Code:
 * - loadSameRepoMessageLogsProgressive: 渐进加载
 * - ResumeConversation.tsx: UI 展示
 */
export function listSessions(cwd: string): SessionSummary[] {
  const dir = getSessionDir(cwd);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  const summaries: SessionSummary[] = [];

  for (const file of files) {
    const sessionId = file.replace(".jsonl", "");
    if (!isValidSessionId(sessionId)) continue;

    const path = join(dir, file);
    const stat = statSync(path);
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    let firstPrompt = "";
    let messageCount = 0;
    let lastCwd = cwd;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Entry;
        if (entry.type === "message") {
          messageCount++;
          if (!firstPrompt && entry.role === "user") {
            firstPrompt = extractText(entry.content);
          }
          if ("cwd" in entry) lastCwd = entry.cwd;
        }
      } catch {
        continue;
      }
    }

    if (messageCount > 0) {
      summaries.push({
        sessionId: sessionId as SessionId,
        firstPrompt: firstPrompt.slice(0, 100),
        messageCount,
        lastTimestamp: stat.mtime.toISOString(),
        cwd: lastCwd,
      });
    }
  }

  return summaries.sort(
    (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime(),
  );
}

// ── 会话恢复 ─────────────────────────────────────────────────

/**
 * 恢复会话：加载历史消息 + 切换 session ID。
 *
 * 对照 Claude Code: conversationRecovery.ts → loadConversationForResume
 * - 加载转录 → 构建消息链
 * - switchSession 切换 sessionId + sessionProjectDir
 * - restoreSessionMetadata 恢复元数据
 */
export function resumeSession(
  sessionId: SessionId,
  cwd: string,
): { messages: Anthropic.MessageParam[]; metadata: Record<string, unknown> } {
  const messages = loadTranscript(sessionId, cwd);

  const path = getTranscriptPath(sessionId, cwd);
  const metadata: Record<string, unknown> = {};

  if (existsSync(path)) {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as Entry;
        if (entry.type === "metadata") {
          metadata[entry.key] = entry.value;
        }
      } catch {
        continue;
      }
    }
  }

  return { messages, metadata };
}

// ── 辅助函数 ─────────────────────────────────────────────────

function extractText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block.type === "text") return block.text;
    }
  }
  return "";
}
