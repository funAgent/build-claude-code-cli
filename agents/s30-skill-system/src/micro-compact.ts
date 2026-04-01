/**
 * s25 — 微压缩 (Micro Compact)
 *
 * 核心思想：在调用 API 做摘要之前，先用零成本的本地操作释放空间。
 * 老旧的工具结果（如几轮前的 file_read 输出）往往占据大量 token，
 * 但对当前对话已无直接意义——直接替换为占位符即可。
 *
 * 优先级：microcompact（免费）→ autocompact（API 调用）→ reactive（错误触发）
 *
 * 对照 Claude Code: microCompact.ts
 * 生产版有时间触发（time-based）、缓存微压缩（cached MC）等策略。
 * 教学版聚焦核心：清理老旧工具结果。
 */

import type Anthropic from "@anthropic-ai/sdk";

// 可压缩的工具列表——这些工具的输出通常很大但时效性低
// 对照 Claude Code: COMPACTABLE_TOOLS
const COMPACTABLE_TOOLS = new Set([
  "file_read",
  "bash",
  "grep",
  "glob",
  "ls",
  "web_search",
  "web_fetch",
]);

// 工具结果被清理后的占位消息
// 对照 Claude Code: TOOL_RESULT_CLEARED_MESSAGE / TIME_BASED_MC_CLEARED_MESSAGE
const CLEARED_MESSAGE = "[此工具结果已被微压缩清理，以释放上下文空间]";

// 保留最近 N 个工具结果不被清理
// 对照 Claude Code: keepRecent 参数（由 config 控制）
const KEEP_RECENT = 5;

/**
 * 粗略估算消息列表的 token 数。
 * 与 compact.ts 中的版本一致。
 */
export function estimateMessageTokens(
  messages: Anthropic.MessageParam[],
): number {
  let charCount = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      charCount += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ("text" in block && typeof block.text === "string") {
          charCount += block.text.length;
        } else if ("content" in block && typeof block.content === "string") {
          charCount += block.content.length;
        }
      }
    }
  }
  return Math.ceil((charCount / 4) * (4 / 3));
}

/**
 * 微压缩：清理老旧的工具结果。
 *
 * 算法：
 * 1. 遍历所有消息，收集可压缩工具的 tool_result block
 * 2. 保留最近 KEEP_RECENT 个，其余替换为占位符
 * 3. 直接修改消息数组（原地操作），不调用 API
 *
 * 对照 Claude Code: microcompactMessages()
 * 生产版还有 time-based 清理（距离上次活跃超过 N 分钟的工具结果）
 * 和 cached microcompact（在 API 层面做的 cache_edits，不修改本地消息）。
 */
export function microcompactMessages(
  messages: Anthropic.MessageParam[],
): { messages: Anthropic.MessageParam[]; freedTokens: number } {
  // 收集所有可压缩的 tool_result 位置
  const candidates: Array<{
    msgIdx: number;
    blockIdx: number;
    toolName: string;
    contentLength: number;
  }> = [];

  for (let mi = 0; mi < messages.length; mi++) {
    const msg = messages[mi];
    if (msg.role !== "user" || !Array.isArray(msg.content)) continue;

    for (let bi = 0; bi < msg.content.length; bi++) {
      const block = msg.content[bi];
      if (block.type !== "tool_result") continue;

      // 检查前面的 assistant 消息中对应的 tool_use 名称
      const toolName = findToolName(messages, block.tool_use_id);
      if (!toolName || !COMPACTABLE_TOOLS.has(toolName)) continue;

      const contentLength =
        typeof block.content === "string"
          ? block.content.length
          : Array.isArray(block.content)
            ? block.content.reduce(
                (sum, b) =>
                  sum + ("text" in b ? b.text.length : 0),
                0,
              )
            : 0;

      // 已经是占位符的跳过
      if (
        typeof block.content === "string" &&
        block.content === CLEARED_MESSAGE
      ) {
        continue;
      }

      candidates.push({ msgIdx: mi, blockIdx: bi, toolName, contentLength });
    }
  }

  // 保留最近 KEEP_RECENT 个，清理其余
  if (candidates.length <= KEEP_RECENT) {
    return { messages, freedTokens: 0 };
  }

  const toClean = candidates.slice(0, candidates.length - KEEP_RECENT);
  let freedChars = 0;

  // 原地替换 content
  for (const { msgIdx, blockIdx, contentLength } of toClean) {
    const msg = messages[msgIdx];
    if (!Array.isArray(msg.content)) continue;

    const block = msg.content[blockIdx] as Anthropic.ToolResultBlockParam;
    freedChars += contentLength - CLEARED_MESSAGE.length;
    block.content = CLEARED_MESSAGE;
  }

  const freedTokens = Math.ceil((freedChars / 4) * (4 / 3));
  return { messages, freedTokens };
}

/**
 * 在消息历史中找到某个 tool_use_id 对应的工具名称。
 */
function findToolName(
  messages: Anthropic.MessageParam[],
  toolUseId: string,
): string | undefined {
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (block.type === "tool_use" && block.id === toolUseId) {
        return block.name;
      }
    }
  }
  return undefined;
}
