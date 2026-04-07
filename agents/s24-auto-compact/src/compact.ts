/**
 * s24 — 自动压缩 (Auto Compact)
 *
 * 核心问题：对话持续进行时，messages 数组会不断膨胀，
 * 最终超出模型的 context window 上限导致 API 报错。
 *
 * 解决方案：当 token 数接近阈值时，用模型自己对对话历史做摘要压缩，
 * 用一条摘要消息替换掉大量旧消息——保留记忆的骨架，丢掉细节。
 *
 * 对照 Claude Code:
 *   - autoCompact.ts: shouldAutoCompact() 阈值检测
 *   - compact.ts: compactConversation() 完整压缩流程
 *   生产版有 PTL 重试、session memory compaction、post-compact 附件恢复等
 *   教学版聚焦核心：阈值判断 → API 摘要 → 消息重建
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

// ── 阈值常量 ────────────────────────────────────────────────
// 模型 context window（Claude Sonnet 的实际值是 200K，教学用 200K）
const CONTEXT_WINDOW_TOKENS = 200_000;
// 预留给模型输出的 token 数
const MAX_OUTPUT_TOKENS = 16_384;
// 有效上下文 = 总窗口 - 输出预留
const EFFECTIVE_CONTEXT = CONTEXT_WINDOW_TOKENS - MAX_OUTPUT_TOKENS;
// 自动压缩缓冲区：在有效上下文的基础上再留 13K 余量
// 对照 Claude Code: AUTOCOMPACT_BUFFER_TOKENS = 13_000
const AUTOCOMPACT_BUFFER = 13_000;
// 最终阈值 = 有效上下文 - 缓冲区
const COMPACT_THRESHOLD = EFFECTIVE_CONTEXT - AUTOCOMPACT_BUFFER;

// 摘要输出的最大 token 数
const MAX_SUMMARY_TOKENS = 8_192;

// 压缩连续失败上限（熔断）
// 对照 Claude Code: MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3
const MAX_CONSECUTIVE_FAILURES = 3;

// ── Token 估算 ──────────────────────────────────────────────
/**
 * 粗略估算消息列表的 token 数。
 *
 * 精确计数需要 tokenizer（如 tiktoken），但加载 tokenizer 本身
 * 就有开销。Claude Code 也用估算（4 字符 ≈ 1 token，再乘 4/3 安全系数）。
 * 对于阈值判断场景，±20% 的误差完全可以接受。
 */
export function estimateTokenCount(
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
  // 4 chars ≈ 1 token, ×4/3 safety margin
  return Math.ceil((charCount / 4) * (4 / 3));
}

// ── 压缩状态 ────────────────────────────────────────────────
/**
 * 跟踪压缩状态：是否已压缩过、连续失败次数。
 * 对照 Claude Code: AutoCompactTrackingState
 */
export interface CompactState {
  compacted: boolean;
  consecutiveFailures: number;
}

export function createCompactState(): CompactState {
  return { compacted: false, consecutiveFailures: 0 };
}

// ── 阈值判断 ────────────────────────────────────────────────
/**
 * 判断是否需要自动压缩。
 *
 * 核心逻辑：估算当前 messages 的 token 数，超过阈值就返回 true。
 * 对照 Claude Code: shouldAutoCompact() — 还会检查 querySource、
 * feature flags、DISABLE_COMPACT 环境变量等，教学版简化为纯阈值判断。
 */
export function shouldAutoCompact(
  messages: Anthropic.MessageParam[],
  state: CompactState,
): { shouldCompact: boolean; tokenCount: number } {
  // 熔断：连续失败太多次，停止尝试
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return { shouldCompact: false, tokenCount: 0 };
  }

  const tokenCount = estimateTokenCount(messages);
  return {
    shouldCompact: tokenCount > COMPACT_THRESHOLD,
    tokenCount,
  };
}

// ── 压缩提示词 ──────────────────────────────────────────────
/**
 * 构建发给模型的压缩请求。
 * 要求模型生成结构化摘要：保留关键信息，丢弃冗余细节。
 *
 * 对照 Claude Code: getCompactPrompt(customInstructions)
 * 生产版的 prompt 更复杂，会附带 custom instructions、hook 输出等。
 */
function getCompactPrompt(): string {
  return `请对以上对话生成一份结构化摘要。要求：

1. **保留关键信息**：
   - 用户的核心需求和意图
   - 已完成的操作和文件修改
   - 重要的决策及其理由
   - 未完成的待办事项

2. **可丢弃的内容**：
   - 工具调用的详细输出（保留结论即可）
   - 中间的试错过程
   - 重复的确认对话

3. **格式**：使用 Markdown，分为"已完成"、"当前状态"、"待办"三个部分。

请直接输出摘要，不要加额外的解释。`;
}

// ── 执行压缩 ────────────────────────────────────────────────
/**
 * 执行对话压缩：把当前 messages 发给模型，请求生成摘要，
 * 然后用摘要替换旧消息。
 *
 * 返回新的 messages 数组（只有摘要 + 最后一轮对话）。
 *
 * 对照 Claude Code: compactConversation()
 * 生产版有 forked agent 复用 prompt cache、PTL 重试循环、
 * post-compact 文件附件恢复等。教学版聚焦核心流程。
 */
export async function compactConversation(
  messages: Anthropic.MessageParam[],
  client: Anthropic,
  state: CompactState,
  onStatus?: (status: string) => void,
): Promise<{
  messages: Anthropic.MessageParam[];
  summary: string;
  tokensBefore: number;
  tokensAfter: number;
}> {
  const tokensBefore = estimateTokenCount(messages);
  onStatus?.(`上下文压缩中... (当前 ~${tokensBefore} tokens)`);

  try {
    // 将历史消息 + 压缩请求一起发给模型
    const compactMessages: Anthropic.MessageParam[] = [
      ...messages,
      { role: "user", content: getCompactPrompt() },
    ];

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_SUMMARY_TOKENS,
      // 压缩请求用极简 system prompt，避免浪费 token
      system: "你是一个对话摘要助手。请准确、简洁地总结对话内容。",
      messages: compactMessages,
    });

    const summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!summary) {
      throw new Error("压缩返回空摘要");
    }

    // ── 重建消息数组 ──────────────────────────────────
    // Compact Boundary: 摘要作为一条 user 消息，标记为压缩产物
    // 对照 Claude Code: createCompactBoundaryMessage()
    const compactBoundary: Anthropic.MessageParam = {
      role: "user",
      content: `[以下是之前对话的摘要，由自动压缩生成]\n\n${summary}\n\n[摘要结束，请基于以上摘要继续对话]`,
    };

    // 保留最后一轮对话（最近的 user + assistant）
    // 这样模型知道"刚才在做什么"
    const lastMessages = getLastConversationTurn(messages);

    const newMessages: Anthropic.MessageParam[] = [
      compactBoundary,
      // 需要一条 assistant 确认，保持 user/assistant 交替
      {
        role: "assistant",
        content: "我已了解之前的对话上下文。请继续。",
      },
      ...lastMessages,
    ];

    const tokensAfter = estimateTokenCount(newMessages);

    // 重置失败计数
    state.compacted = true;
    state.consecutiveFailures = 0;

    onStatus?.(
      `压缩完成: ${tokensBefore} → ${tokensAfter} tokens (节省 ${Math.round(((tokensBefore - tokensAfter) / tokensBefore) * 100)}%)`,
    );

    return { messages: newMessages, summary, tokensBefore, tokensAfter };
  } catch (error) {
    state.consecutiveFailures++;
    onStatus?.(
      `压缩失败 (${state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error instanceof Error ? error.message : "未知错误"}`,
    );
    // 压缩失败时返回原消息，不破坏对话
    return { messages, summary: "", tokensBefore, tokensAfter: tokensBefore };
  }
}

// ── 辅助函数 ────────────────────────────────────────────────
/**
 * 提取最后一轮完整对话（最后的 user 消息 + 之后的所有 assistant 消息）。
 * 保留最近一轮是为了让模型知道刚才的上下文。
 */
function getLastConversationTurn(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return [];

  // 从后往前找最后一条 user 消息
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) return messages.slice(-2);
  return messages.slice(lastUserIdx);
}

/**
 * 获取压缩阈值（便于外部访问）
 */
export function getCompactThreshold(): number {
  return COMPACT_THRESHOLD;
}
