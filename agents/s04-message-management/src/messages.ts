/**
 * s04 — 消息格式化与截断
 *
 * 消息管理的两个核心任务：
 * 1. 格式化：让终端输出好看
 * 2. 截断：防止单条消息太长，占满上下文窗口
 *
 * 对照 Claude Code: utils/messages.ts
 * 生产版有 normalizeMessagesForAPI / normalizeMessages / reorderMessagesInUI 等 30+ 函数，
 * 我们只保留格式化和截断两个核心功能。
 */

import type { AgentMessage } from "./types.js";

const MAX_CONTENT_LENGTH = 10_000;
const TRUNCATION_NOTICE = "\n...[内容已截断，原始长度: {len} 字符]";

export function truncateContent(content: string, maxLen = MAX_CONTENT_LENGTH): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + TRUNCATION_NOTICE.replace("{len}", String(content.length));
}

export function formatMessage(msg: AgentMessage): string {
  const time = new Date(msg.timestamp).toLocaleTimeString();

  if (msg.role === "user") {
    const text = typeof msg.content === "string"
      ? msg.content
      : "[complex content]";
    return `[${time}] you> ${text}`;
  }

  if (typeof msg.content === "string") {
    return `[${time}] assistant> ${msg.content}`;
  }

  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text" && "text" in block) {
      parts.push(`assistant> ${block.text}`);
    } else if (block.type === "tool_use" && "name" in block) {
      parts.push(`  [tool] ${block.name}(${JSON.stringify("input" in block ? block.input : {})})`);
    }
  }

  const tokenInfo = msg.tokenCount
    ? `  [${msg.tokenCount.input} in / ${msg.tokenCount.output} out]`
    : "";

  return `[${time}] ${parts.join("\n")}${tokenInfo}`;
}

export function toApiMessages(
  messages: AgentMessage[]
): { role: "user" | "assistant"; content: string | Anthropic.ContentBlockParam[] }[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: typeof msg.content === "string"
      ? truncateContent(msg.content)
      : msg.content,
  }));
}

export function getConversationStats(messages: AgentMessage[]): {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalInputTokens: number;
  totalOutputTokens: number;
} {
  let totalInput = 0;
  let totalOutput = 0;
  let userCount = 0;
  let assistantCount = 0;

  for (const msg of messages) {
    if (msg.role === "user") userCount++;
    else assistantCount++;
    if (msg.tokenCount) {
      totalInput += msg.tokenCount.input;
      totalOutput += msg.tokenCount.output;
    }
  }

  return {
    totalMessages: messages.length,
    userMessages: userCount,
    assistantMessages: assistantCount,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
  };
}

import type Anthropic from "@anthropic-ai/sdk";
