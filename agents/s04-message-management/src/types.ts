/**
 * s04 — 消息类型系统
 *
 * messages 数组不是日志，是 Agent 的工作记忆。
 * 每种消息类型有不同的结构和用途。
 *
 * 对照 Claude Code: types/message.ts
 * 生产版有 7+ 种消息类型（user/assistant/system/attachment/progress/grouped/collapsed），
 * 我们简化为 3 种核心类型。
 */

import type Anthropic from "@anthropic-ai/sdk";

export type ContentBlock = Anthropic.ContentBlock;
export type ContentBlockParam = Anthropic.ContentBlockParam;

export interface AgentMessage {
  role: "user" | "assistant";
  content: string | ContentBlockParam[];
  timestamp: number;
  tokenCount?: { input: number; output: number };
}

export function createUserMessage(content: string): AgentMessage {
  return { role: "user", content, timestamp: Date.now() };
}

export function createAssistantMessage(
  content: ContentBlock[],
  usage?: { input_tokens: number; output_tokens: number }
): AgentMessage {
  return {
    role: "assistant",
    content: content as ContentBlockParam[],
    timestamp: Date.now(),
    tokenCount: usage ? { input: usage.input_tokens, output: usage.output_tokens } : undefined,
  };
}

export function createToolResultMessage(
  results: Anthropic.ToolResultBlockParam[]
): AgentMessage {
  return { role: "user", content: results, timestamp: Date.now() };
}

export function getTextContent(message: AgentMessage): string {
  if (typeof message.content === "string") return message.content;

  return message.content
    .filter((block): block is Anthropic.TextBlockParam => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function hasToolUse(message: AgentMessage): boolean {
  if (typeof message.content === "string") return false;
  return message.content.some((block) => block.type === "tool_use");
}

export function getToolUseBlocks(
  message: AgentMessage
): Anthropic.ToolUseBlockParam[] {
  if (typeof message.content === "string") return [];
  return message.content.filter(
    (block): block is Anthropic.ToolUseBlockParam => block.type === "tool_use"
  );
}
