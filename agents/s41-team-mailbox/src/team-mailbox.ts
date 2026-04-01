/**
 * s41 — Team + Mailbox
 *
 * 当任务太大一个 Agent 搞不定，就创建一个团队。
 * 文件邮箱（JSONL 文件）是最可靠的进程间通信。
 *
 * 关键流程：
 * 1. TeamCreate → 创建团队 + 邮箱目录
 * 2. SendMessage → 向队友邮箱写入消息
 * 3. ReadMailbox → 读取未读消息
 * 4. 共享任务列表 → 团队级任务追踪
 *
 * 对照 Claude Code:
 * - utils/swarm/teammateMailbox.ts (~400 行)
 * - TeammateMessage 类型 + readMailbox + writeToMailbox
 * - SendMessageTool + TeamCreateTool
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

// ── 类型定义 ─────────────────────────────────────────────────

/**
 * 队友邮箱消息。
 * 对照 Claude Code: TeammateMessage
 */
export interface TeammateMessage {
  from: string;
  text: string;
  timestamp: string;
  read: boolean;
}

/**
 * 团队信息。
 */
export interface Team {
  name: string;
  leader: string;
  members: string[];
  createdAt: string;
}

// ── 路径管理 ─────────────────────────────────────────────────

function getTeamDir(teamName: string): string {
  return join(homedir(), ".agent-cli", "teams", sanitize(teamName));
}

function getInboxPath(teamName: string, memberName: string): string {
  return join(getTeamDir(teamName), "inboxes", `${sanitize(memberName)}.json`);
}

function getTeamInfoPath(teamName: string): string {
  return join(getTeamDir(teamName), "team.json");
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

// ── 团队管理 ─────────────────────────────────────────────────

/**
 * 创建团队。
 * 对照 Claude Code: TeamCreateTool
 */
export function createTeam(
  teamName: string,
  leader: string,
  members: string[],
): Team {
  const teamDir = getTeamDir(teamName);
  const inboxDir = join(teamDir, "inboxes");
  mkdirSync(inboxDir, { recursive: true });

  const team: Team = {
    name: teamName,
    leader,
    members: [leader, ...members],
    createdAt: new Date().toISOString(),
  };

  writeFileSync(getTeamInfoPath(teamName), JSON.stringify(team, null, 2), "utf-8");

  for (const member of team.members) {
    const inbox = getInboxPath(teamName, member);
    if (!existsSync(inbox)) {
      writeFileSync(inbox, "[]", "utf-8");
    }
  }

  return team;
}

/**
 * 删除团队。
 * 对照 Claude Code: TeamDeleteTool
 */
export function deleteTeam(teamName: string): boolean {
  const teamDir = getTeamDir(teamName);
  if (!existsSync(teamDir)) return false;

  const { rmSync } = require("fs");
  rmSync(teamDir, { recursive: true, force: true });
  return true;
}

/**
 * 获取团队信息。
 */
export function getTeamInfo(teamName: string): Team | null {
  const path = getTeamInfoPath(teamName);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ── 邮箱操作 ─────────────────────────────────────────────────

/**
 * 读取邮箱中的所有消息。
 * 对照 Claude Code: readMailbox
 */
export function readMailbox(teamName: string, memberName: string): TeammateMessage[] {
  const path = getInboxPath(teamName, memberName);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
}

/**
 * 读取未读消息。
 * 对照 Claude Code: readUnreadMessages
 */
export function readUnreadMessages(
  teamName: string,
  memberName: string,
): TeammateMessage[] {
  return readMailbox(teamName, memberName).filter((m) => !m.read);
}

/**
 * 向队友邮箱写入消息。
 *
 * 对照 Claude Code: writeToMailbox
 * - 文件锁保证并发安全
 * - 追加 read: false 的新消息
 */
export function writeToMailbox(
  teamName: string,
  to: string,
  from: string,
  text: string,
): void {
  const path = getInboxPath(teamName, to);

  const inboxDir = join(getTeamDir(teamName), "inboxes");
  mkdirSync(inboxDir, { recursive: true });

  const messages = existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf-8")) as TeammateMessage[])
    : [];

  messages.push({
    from,
    text,
    timestamp: new Date().toISOString(),
    read: false,
  });

  writeFileSync(path, JSON.stringify(messages, null, 2), "utf-8");
}

/**
 * 标记消息为已读。
 * 对照 Claude Code: markMessagesAsRead
 */
export function markMessagesAsRead(teamName: string, memberName: string): void {
  const path = getInboxPath(teamName, memberName);
  if (!existsSync(path)) return;

  const messages = JSON.parse(readFileSync(path, "utf-8")) as TeammateMessage[];
  for (const msg of messages) {
    msg.read = true;
  }
  writeFileSync(path, JSON.stringify(messages, null, 2), "utf-8");
}

/**
 * 格式化消息为 XML（供 Agent 上下文注入）。
 *
 * 对照 Claude Code: formatTeammateMessages → <teammate_message> XML
 */
export function formatMessages(messages: TeammateMessage[]): string {
  return messages
    .map(
      (m) =>
        `<teammate_message from="${m.from}" time="${m.timestamp}">\n${m.text}\n</teammate_message>`,
    )
    .join("\n");
}
