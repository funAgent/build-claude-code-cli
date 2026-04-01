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

// AgentMessage 是 Agent 的"工作记忆"单元
// 注意 content 有两种形态：
//   string — 纯文本（用户输入、简单回复）
//   ContentBlockParam[] — 结构化内容（包含 text + tool_use + tool_result blocks）
// 这种联合类型避免了简单场景下创建数组的开销
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

// 工具结果以 role: "user" 发送——这是 API 协议的强制要求
// 对话结构是严格的 user ↔ assistant 交替
// 工具结果虽然不是"用户说的话"，但 API 要求它在 user 位置
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
