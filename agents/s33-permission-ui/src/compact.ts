/**
 * s25 — 多层压缩（Multi-layer Compact）
 *
 * 在 s24 的基础上扩展为三层压缩策略：
 *
 * Layer 1: microcompact — 零成本本地清理（清除旧工具结果）
 * Layer 2: autocompact — API 摘要压缩（token 超阈值时触发）
 * Layer 3: reactive compact — 错误兜底（prompt-too-long 时紧急压缩）
 *
 * 加上 circuit breaker（熔断器）：连续失败时停止压缩尝试。
 *
 * 策略递进原则：先用免费的，再用收费的，最后用紧急的。
 *
 * 对照 Claude Code:
 *   - microCompact.ts: 轻量级本地清理
 *   - autoCompact.ts: 阈值触发 API 压缩
 *   - query.ts: reactive compact（PROMPT_TOO_LONG 错误后触发）
 *   - circuit breaker: consecutiveFailures >= 3
 */

import Anthropic from "@anthropic-ai/sdk";
import { microcompactMessages, estimateMessageTokens } from "./micro-compact.js";

// ── 阈值常量 ────────────────────────────────────────────────
const CONTEXT_WINDOW_TOKENS = 200_000;
const MAX_OUTPUT_TOKENS = 16_384;
const EFFECTIVE_CONTEXT = CONTEXT_WINDOW_TOKENS - MAX_OUTPUT_TOKENS;
const AUTOCOMPACT_BUFFER = 13_000;
const COMPACT_THRESHOLD = EFFECTIVE_CONTEXT - AUTOCOMPACT_BUFFER;

const MAX_SUMMARY_TOKENS = 8_192;
const MAX_CONSECUTIVE_FAILURES = 3;

// 微压缩阈值：比 autocompact 阈值低一些，更早触发
const MICRO_COMPACT_THRESHOLD = Math.floor(COMPACT_THRESHOLD * 0.7);

// ── Token 估算 ──────────────────────────────────────────────
export function estimateTokenCount(
  messages: Anthropic.MessageParam[],
): number {
  return estimateMessageTokens(messages);
}

// ── 压缩状态 ────────────────────────────────────────────────
export interface CompactState {
  compacted: boolean;
  consecutiveFailures: number;
  microCompactApplied: boolean;
  totalCompactions: number;
}

export function createCompactState(): CompactState {
  return {
    compacted: false,
    consecutiveFailures: 0,
    microCompactApplied: false,
    totalCompactions: 0,
  };
}

// ── 多层压缩策略 ─────────────────────────────────────────────

/**
 * Layer 1: 微压缩 — 尝试免费的本地清理。
 * 返回是否释放了足够空间（使 token 数回到阈值以下）。
 */
export function tryMicroCompact(
  messages: Anthropic.MessageParam[],
  state: CompactState,
  onStatus?: (status: string) => void,
): { messages: Anthropic.MessageParam[]; sufficient: boolean } {
  const before = estimateTokenCount(messages);

  if (before < MICRO_COMPACT_THRESHOLD) {
    return { messages, sufficient: true };
  }

  const { messages: cleaned, freedTokens } = microcompactMessages(messages);

  if (freedTokens > 0) {
    state.microCompactApplied = true;
    onStatus?.(
      `微压缩: 清理旧工具结果，释放 ~${freedTokens} tokens`,
    );
  }

  const after = estimateTokenCount(cleaned);
  return {
    messages: cleaned,
    sufficient: after < COMPACT_THRESHOLD,
  };
}

/**
 * Layer 2: 自动压缩 — 阈值判断 + API 摘要。
 * 与 s24 的 shouldAutoCompact 相同。
 */
export function shouldAutoCompact(
  messages: Anthropic.MessageParam[],
  state: CompactState,
): { shouldCompact: boolean; tokenCount: number } {
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return { shouldCompact: false, tokenCount: 0 };
  }
  const tokenCount = estimateTokenCount(messages);
  return {
    shouldCompact: tokenCount > COMPACT_THRESHOLD,
    tokenCount,
  };
}

/**
 * Layer 3: Reactive Compact — 在 prompt-too-long 错误后紧急触发。
 *
 * 与 autocompact 的区别：
 * - 不检查阈值（已经报错了，必须压缩）
 * - 更激进地截断消息（保留更少的历史）
 * - 仍然受 circuit breaker 保护
 *
 * 对照 Claude Code: query.ts 中捕获 PROMPT_TOO_LONG 错误后
 * 调用 reactiveCompact() → 降级重试。
 */
export async function reactiveCompact(
  messages: Anthropic.MessageParam[],
  client: Anthropic,
  state: CompactState,
  onStatus?: (status: string) => void,
): Promise<{
  messages: Anthropic.MessageParam[];
  success: boolean;
}> {
  // 熔断检查
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    onStatus?.(`⚠ 熔断器已开启: 连续 ${state.consecutiveFailures} 次压缩失败，停止重试`);
    return { messages, success: false };
  }

  onStatus?.("🚨 Reactive compact: prompt-too-long 错误后紧急压缩...");

  // 先做一轮微压缩
  const { messages: cleaned } = microcompactMessages(messages);

  // 然后做 API 摘要压缩
  const result = await compactConversation(
    cleaned,
    client,
    state,
    onStatus,
  );

  return {
    messages: result.messages,
    success: result.summary !== "",
  };
}

// ── 压缩提示词 ──────────────────────────────────────────────
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
    const compactMessages: Anthropic.MessageParam[] = [
      ...messages,
      { role: "user", content: getCompactPrompt() },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: MAX_SUMMARY_TOKENS,
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

    const compactBoundary: Anthropic.MessageParam = {
      role: "user",
      content: `[以下是之前对话的摘要，由自动压缩生成]\n\n${summary}\n\n[摘要结束，请基于以上摘要继续对话]`,
    };

    const lastMessages = getLastConversationTurn(messages);

    const newMessages: Anthropic.MessageParam[] = [
      compactBoundary,
      {
        role: "assistant",
        content: "我已了解之前的对话上下文。请继续。",
      },
      ...lastMessages,
    ];

    const tokensAfter = estimateTokenCount(newMessages);

    state.compacted = true;
    state.consecutiveFailures = 0;
    state.totalCompactions++;

    onStatus?.(
      `压缩完成: ${tokensBefore} → ${tokensAfter} tokens (节省 ${Math.round(((tokensBefore - tokensAfter) / tokensBefore) * 100)}%)`,
    );

    return { messages: newMessages, summary, tokensBefore, tokensAfter };
  } catch (error) {
    state.consecutiveFailures++;
    onStatus?.(
      `压缩失败 (${state.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error instanceof Error ? error.message : "未知错误"}`,
    );
    return { messages, summary: "", tokensBefore, tokensAfter: tokensBefore };
  }
}

function getLastConversationTurn(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  if (messages.length === 0) return [];
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

export function getCompactThreshold(): number {
  return COMPACT_THRESHOLD;
}

/**
 * 判断错误是否为 prompt-too-long（用于触发 reactive compact）。
 */
export function isPromptTooLongError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("prompt is too long") ||
           error.message.includes("prompt_too_long");
  }
  return false;
}
