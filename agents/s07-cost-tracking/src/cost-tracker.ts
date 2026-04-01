/**
 * s07 — 成本追踪器
 *
 * 实时累加 token 消耗，按模型定价计算美元成本。
 * 每次 API 调用后更新，用户可通过 /cost 命令查看。
 *
 * 对照 Claude Code: bootstrap/state.ts 中的 token 计数器
 * 生产版的计数器是全局状态的一部分，支持按会话、按模型分别统计
 */

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-20250514": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
  "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
};

const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 3, outputPerMillion: 15 };

export class CostTracker {
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private apiCalls = 0;
  private model: string;

  constructor(model: string) {
    this.model = model;
  }

  addUsage(usage: { input_tokens: number; output_tokens: number }): void {
    this.totalInputTokens += usage.input_tokens;
    this.totalOutputTokens += usage.output_tokens;
    this.apiCalls++;
  }

  private getPricing(): ModelPricing {
    return PRICING[this.model] ?? DEFAULT_PRICING;
  }

  // 实时计算当前累计成本（美元）
  // 输出 tokens 比输入贵 ~5 倍——这影响 prompt 设计：
  // 尽量用 system prompt 提供信息（input），让模型少输出废话（output）
  getCost(): { inputCost: number; outputCost: number; totalCost: number } {
    const pricing = this.getPricing();
    const inputCost = (this.totalInputTokens / 1_000_000) * pricing.inputPerMillion;
    const outputCost = (this.totalOutputTokens / 1_000_000) * pricing.outputPerMillion;
    return { inputCost, outputCost, totalCost: inputCost + outputCost };
  }

  showCost(): void {
    const cost = this.getCost();
    console.log("\n--- 成本统计 ---");
    console.log(`模型: ${this.model}`);
    console.log(`API 调用次数: ${this.apiCalls}`);
    console.log(`输入 tokens: ${this.totalInputTokens.toLocaleString()}`);
    console.log(`输出 tokens: ${this.totalOutputTokens.toLocaleString()}`);
    console.log(`输入成本: $${cost.inputCost.toFixed(6)}`);
    console.log(`输出成本: $${cost.outputCost.toFixed(6)}`);
    console.log(`总成本: $${cost.totalCost.toFixed(6)}`);
  }

  getInlineStatus(): string {
    const cost = this.getCost();
    return `[${this.totalInputTokens}↓ ${this.totalOutputTokens}↑ $${cost.totalCost.toFixed(4)}]`;
  }
}
