/**
 * s44 — 递进式错误恢复
 *
 * 错误恢复不是 retry 3 次——是一套分级递进的策略栈。
 * 每种错误有对应的恢复策略，从轻到重逐级尝试。
 *
 * 关键流程：
 * 1. 分类错误 → classifyAPIError
 * 2. 选择恢复策略 → 重试/退避/compact/降级模型/恢复消息
 * 3. withRetry 处理瞬态错误（429/529）
 * 4. 熔断器防止无限重试
 *
 * 对照 Claude Code:
 * - query.ts (~1500 行): 主循环中的错误恢复链
 * - services/api/withRetry.ts (~400 行): retry/backoff/fallback
 * - services/api/errors.ts (~200 行): 错误分类
 */

// ── 错误分类 ─────────────────────────────────────────────────

/**
 * API 错误类型。
 * 对照 Claude Code: classifyAPIError 的返回值
 */
export type APIErrorType =
  | "rate_limit"        // 429: 速率限制
  | "server_overload"   // 529: 服务器过载
  | "prompt_too_long"   // 413: 上下文超限
  | "auth_error"        // 401/403: 认证失败
  | "server_error"      // 500+: 服务器错误
  | "connection_error"  // 网络问题
  | "timeout"           // 请求超时
  | "unknown";

/**
 * 分类 API 错误。
 * 对照 Claude Code: classifyAPIError
 */
export function classifyAPIError(
  error: { status?: number; message?: string },
): APIErrorType {
  const { status, message } = error;

  if (status === 429) return "rate_limit";
  if (status === 529 || message?.includes("overloaded_error")) return "server_overload";
  if (status === 413 || message?.includes("prompt_too_long")) return "prompt_too_long";
  if (status === 401 || status === 403) return "auth_error";
  if (status && status >= 500) return "server_error";
  if (message?.includes("ECONNRESET") || message?.includes("fetch failed")) {
    return "connection_error";
  }
  if (message?.includes("timeout")) return "timeout";

  return "unknown";
}

// ── 重试与退避 ───────────────────────────────────────────────

const DEFAULT_MAX_RETRIES = 10;
const MAX_BACKOFF_MS = 32_000;
const MAX_529_RETRIES = 3;

/**
 * 计算退避延迟。
 *
 * 对照 Claude Code: getRetryDelay
 * - 优先使用 Retry-After 头
 * - 否则指数退避 500ms * 2^(attempt-1)，封顶 32s
 * - 加 25% 抖动
 */
export function getRetryDelay(
  attempt: number,
  retryAfterSeconds?: number,
): number {
  if (retryAfterSeconds !== undefined) {
    return retryAfterSeconds * 1000;
  }

  const baseDelay = Math.min(500 * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
  const jitter = baseDelay * 0.25 * Math.random();
  return baseDelay + jitter;
}

/**
 * 带重试的 API 调用包装。
 *
 * 对照 Claude Code: withRetry
 * - 429/529 自动重试+退避
 * - 连续 529 超过阈值 → 降级到 fallback 模型
 * - 不可重试的错误直接抛出
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    fallbackModel?: string;
    onRetry?: (attempt: number, errorType: APIErrorType, delayMs: number) => void;
    onFallback?: (fallbackModel: string) => void;
  } = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let consecutive529 = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      const apiError = error as { status?: number; message?: string };
      const errorType = classifyAPIError(apiError);

      if (!isRetryable(errorType)) {
        throw error;
      }

      if (errorType === "server_overload") {
        consecutive529++;

        if (consecutive529 >= MAX_529_RETRIES && options.fallbackModel) {
          options.onFallback?.(options.fallbackModel);
          throw new FallbackTriggeredError(options.fallbackModel);
        }
      } else {
        consecutive529 = 0;
      }

      if (attempt === maxRetries) throw error;

      const delay = getRetryDelay(attempt);
      options.onRetry?.(attempt, errorType, delay);
      await sleep(delay);
    }
  }

  throw new Error("重试次数已耗尽");
}

function isRetryable(errorType: APIErrorType): boolean {
  return ["rate_limit", "server_overload", "server_error", "connection_error", "timeout"].includes(
    errorType,
  );
}

// ── 递进式恢复策略 ───────────────────────────────────────────

export type RecoveryAction =
  | { type: "retry"; delay: number }
  | { type: "compact" }
  | { type: "fallback_model"; model: string }
  | { type: "recovery_message"; message: string }
  | { type: "abort"; reason: string };

/**
 * 递进式错误恢复策略栈。
 *
 * 对照 Claude Code: query.ts 中的恢复链
 * prompt_too_long → compact → fallback model → recovery message → abort
 */
export function getRecoveryAction(
  errorType: APIErrorType,
  context: {
    compactAttempted: boolean;
    fallbackAttempted: boolean;
    recoveryCount: number;
    fallbackModel?: string;
  },
): RecoveryAction {
  switch (errorType) {
    case "prompt_too_long":
      if (!context.compactAttempted) {
        return { type: "compact" };
      }
      if (!context.fallbackAttempted && context.fallbackModel) {
        return { type: "fallback_model", model: context.fallbackModel };
      }
      return { type: "abort", reason: "上下文过长，压缩和降级均失败" };

    case "rate_limit":
    case "server_overload":
      return { type: "retry", delay: getRetryDelay(context.recoveryCount + 1) };

    case "server_error":
    case "connection_error":
    case "timeout":
      if (context.recoveryCount < 3) {
        return { type: "retry", delay: getRetryDelay(context.recoveryCount + 1) };
      }
      return {
        type: "recovery_message",
        message: "服务暂时不可用，请稍后重试。",
      };

    case "auth_error":
      return { type: "abort", reason: "认证失败，请检查 API 密钥" };

    default:
      return { type: "abort", reason: `未知错误: ${errorType}` };
  }
}

// ── 熔断器 ───────────────────────────────────────────────────

/**
 * 简单的熔断器。
 * 连续失败超过阈值后短路，防止无限重试。
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: "closed" | "open" | "half-open" = "closed";

  constructor(
    private threshold: number = 5,
    private resetTimeMs: number = 60_000,
  ) {}

  recordSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = "open";
    }
  }

  canAttempt(): boolean {
    if (this.state === "closed") return true;
    if (this.state === "open" && Date.now() - this.lastFailure > this.resetTimeMs) {
      this.state = "half-open";
      return true;
    }
    return this.state === "half-open";
  }
}

// ── 辅助 ─────────────────────────────────────────────────────

export class FallbackTriggeredError extends Error {
  constructor(public fallbackModel: string) {
    super(`降级到 fallback 模型: ${fallbackModel}`);
    this.name = "FallbackTriggeredError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
