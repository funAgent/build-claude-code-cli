/**
 * s05 — 指数退避重试
 *
 * API 调用会失败：网络抖动、429 限流、500 服务端错误。
 * 不能 crash，要用指数退避重试。
 *
 * 对照 Claude Code: query.ts 的错误恢复管道
 * 生产版用分级策略：重试 → 压缩 → 降级模型 → 恢复消息
 * 教学版只实现指数退避重试
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30_000,
};

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("429")) return true;
    if (msg.includes("overloaded") || msg.includes("529")) return true;
    if (msg.includes("500") || msg.includes("internal server error")) return true;
    if (msg.includes("timeout") || msg.includes("econnreset")) return true;
  }
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status === 529 || status >= 500;
  }
  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!isRetryableError(error) || attempt === opts.maxRetries) {
        throw error;
      }

      // 指数退避 + 随机抖动：1s → 2s → 4s → 8s...
      // 随机抖动（jitter）防止多个客户端同时重试导致"惊群效应"
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        opts.maxDelay
      );

      console.log(
        `  [retry] 第 ${attempt + 1}/${opts.maxRetries} 次重试，等待 ${Math.round(delay)}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
