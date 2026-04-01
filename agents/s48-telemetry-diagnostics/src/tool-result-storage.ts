/**
 * s26 — 工具结果存储与预算控制 (Tool Result Storage & Budget)
 *
 * 核心问题：单个工具调用可能返回巨大的结果（如读取一个 10K 行的文件），
 * 这些结果会直接进入 messages 数组，占用大量 context window 空间。
 * 即使微压缩可以事后清理，但如果一个工具结果本身就超过了预算，
 * 当轮 API 调用就会因 prompt-too-long 而失败。
 *
 * 解决方案：
 * 1. 大结果持久化到磁盘，messages 中只保留预览
 * 2. 按消息组设置 token 预算，超预算的结果自动替换
 *
 * 对照 Claude Code: utils/toolResultStorage.ts
 *   - persistToolResult: 大结果写入 {sessionDir}/tool-results/
 *   - buildLargeToolResultMessage: 生成预览替换消息
 *   - applyToolResultBudget: 按 per-message 预算裁剪
 *   - enforceToolResultBudget: 最大优先选择替换候选
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// ── 常量 ─────────────────────────────────────────────────────

// 单个工具结果的最大字符数（超过则持久化到磁盘）
// 对照 Claude Code: DEFAULT_MAX_RESULT_SIZE_CHARS = 50_000
const MAX_RESULT_SIZE_CHARS = 50_000;

// 每条 user 消息组的工具结果总 token 预算
// 对照 Claude Code: MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200_000
const PER_MESSAGE_BUDGET_CHARS = 200_000;

// 持久化文件中保留的预览大小（bytes）
// 对照 Claude Code: PREVIEW_SIZE_BYTES = 2000
const PREVIEW_SIZE = 2_000;

// 持久化结果的 XML 标签
const PERSISTED_TAG = "<persisted_tool_result>";
const PERSISTED_CLOSING_TAG = "</persisted_tool_result>";

// ── 持久化逻辑 ──────────────────────────────────────────────

/**
 * 获取工具结果存储目录。
 * 对照 Claude Code: getToolResultsDir()
 */
function getToolResultsDir(sessionDir: string): string {
  return join(sessionDir, "tool-results");
}

/**
 * 将大型工具结果持久化到磁盘。
 *
 * 文件名使用 tool_use_id 确保唯一性。
 * 使用 'wx' flag 避免覆盖已有文件（幂等性保护）。
 *
 * 对照 Claude Code: persistToolResult()
 */
export function persistToolResult(
  toolUseId: string,
  content: string,
  sessionDir: string,
): string {
  const dir = getToolResultsDir(sessionDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const filePath = join(dir, `${toolUseId}.txt`);
  try {
    writeFileSync(filePath, content, { flag: "wx" });
  } catch {
    // 文件已存在，跳过（幂等）
  }
  return filePath;
}

/**
 * 构建大型工具结果的替换消息。
 *
 * 在 messages 中用这条消息替换原始的大输出。
 * 包含：文件路径 + 前 PREVIEW_SIZE 字符的预览。
 *
 * 对照 Claude Code: buildLargeToolResultMessage()
 */
export function buildLargeToolResultMessage(
  filePath: string,
  originalContent: string,
): string {
  const preview = originalContent.slice(0, PREVIEW_SIZE);
  const totalSize = originalContent.length;

  return [
    PERSISTED_TAG,
    `路径: ${filePath}`,
    `总大小: ${totalSize} 字符`,
    "",
    "预览 (前 2000 字符):",
    preview,
    totalSize > PREVIEW_SIZE ? "\n... (内容已截断，完整内容保存在磁盘)" : "",
    PERSISTED_CLOSING_TAG,
  ].join("\n");
}

/**
 * 处理单个工具结果：如果超过大小限制，持久化到磁盘。
 *
 * 对照 Claude Code: processToolResultBlock() / maybePersistLargeToolResult()
 */
export function processToolResult(
  toolUseId: string,
  content: string,
  sessionDir: string,
): { content: string; persisted: boolean } {
  if (content.length <= MAX_RESULT_SIZE_CHARS) {
    return { content, persisted: false };
  }

  const filePath = persistToolResult(toolUseId, content, sessionDir);
  const replacement = buildLargeToolResultMessage(filePath, content);

  return { content: replacement, persisted: true };
}

// ── 预算控制 ─────────────────────────────────────────────────

/**
 * Content Replacement 状态：跟踪已替换的工具结果。
 *
 * 用于确保同一个工具结果在后续 API 调用中仍然使用相同的替换内容
 * （cache-stable replay）。
 *
 * 对照 Claude Code: ContentReplacementState
 */
export interface ContentReplacementState {
  seenIds: Set<string>;
  replacements: Map<string, string>;
}

export function createContentReplacementState(): ContentReplacementState {
  return {
    seenIds: new Set(),
    replacements: new Map(),
  };
}

/**
 * 对消息列表应用工具结果预算控制。
 *
 * 算法：
 * 1. 遍历每条 user 消息中的 tool_result blocks
 * 2. 计算当前消息组的总 token 预算使用量
 * 3. 如果超预算，按大小降序选择替换候选
 * 4. 将选中的大结果持久化到磁盘并替换为预览
 *
 * 对照 Claude Code: applyToolResultBudget() + enforceToolResultBudget()
 * 生产版按 API-level user message groups 分组计算，支持 skipToolNames
 * （如 file_read 的 Infinity 阈值），教学版简化为逐消息检查。
 */
export function applyToolResultBudget(
  messages: Array<{ role: string; content: unknown }>,
  state: ContentReplacementState,
  sessionDir: string,
): { messages: Array<{ role: string; content: unknown }>; replacedCount: number } {
  let replacedCount = 0;

  for (const msg of messages) {
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;

    // 计算当前消息中所有 tool_result 的总大小
    let totalChars = 0;
    const candidates: Array<{
      blockIdx: number;
      toolUseId: string;
      content: string;
      size: number;
    }> = [];

    for (let i = 0; i < msg.content.length; i++) {
      const block = msg.content[i] as Record<string, unknown>;
      if (block.type !== "tool_result") continue;

      const toolUseId = block.tool_use_id as string;

      // 已有替换的直接应用（cache-stable replay）
      if (state.replacements.has(toolUseId)) {
        block.content = state.replacements.get(toolUseId);
        state.seenIds.add(toolUseId);
        continue;
      }

      const content = typeof block.content === "string" ? block.content : "";
      const size = content.length;
      totalChars += size;

      if (!state.seenIds.has(toolUseId)) {
        candidates.push({ blockIdx: i, toolUseId, content, size });
      }
    }

    // 超预算：按大小降序替换，直到回到预算内
    if (totalChars > PER_MESSAGE_BUDGET_CHARS) {
      // 最大优先（greedy，与 Claude Code 的 selectFreshToReplace 一致）
      candidates.sort((a, b) => b.size - a.size);

      for (const candidate of candidates) {
        if (totalChars <= PER_MESSAGE_BUDGET_CHARS) break;

        const filePath = persistToolResult(
          candidate.toolUseId,
          candidate.content,
          sessionDir,
        );
        const replacement = buildLargeToolResultMessage(
          filePath,
          candidate.content,
        );

        const block = msg.content[candidate.blockIdx] as Record<string, unknown>;
        block.content = replacement;

        state.replacements.set(candidate.toolUseId, replacement);
        state.seenIds.add(candidate.toolUseId);

        totalChars -= candidate.size - replacement.length;
        replacedCount++;
      }
    }

    // 标记所有已见的 ID
    for (const c of candidates) {
      state.seenIds.add(c.toolUseId);
    }
  }

  return { messages, replacedCount };
}

/**
 * 获取持久化阈值（便于外部访问）
 */
export function getPersistenceThreshold(): number {
  return MAX_RESULT_SIZE_CHARS;
}
