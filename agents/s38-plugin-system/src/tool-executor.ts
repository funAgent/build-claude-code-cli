/**
 * s22 — StreamingToolExecutor
 *
 * 在流式返回过程中，工具调用可以并行执行。
 * 核心规则：
 * 1. 并发安全的工具（读操作）可以同时执行
 * 2. 非并发安全的工具（写操作）必须独占执行
 * 3. 结果按原始顺序返回（保证对话一致性）
 *
 * 对照 Claude Code: services/tools/StreamingToolExecutor.ts
 * 生产版有：
 * - isConcurrencySafe(input) 方法（根据具体参数判断）
 * - sibling abort（bash 错误取消同级工具）
 * - progress streaming（工具执行进度实时推送）
 * - 有序 drain（按原始顺序 yield 结果）
 *
 * 教学版简化为核心的"安全/非安全"分组并行模式
 */

import type { Tool, ToolContext, ToolResult } from "./tool.js";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolCallResult {
  id: string;
  name: string;
  result: ToolResult;
}

type TrackedStatus = "queued" | "executing" | "completed";

interface TrackedTool {
  call: ToolCall;
  tool: Tool | undefined;
  isSafe: boolean;
  status: TrackedStatus;
  result?: ToolResult;
  promise?: Promise<void>;
}

export class StreamingToolExecutor {
  private queue: TrackedTool[] = [];
  private context: ToolContext;
  private onProgress?: (call: ToolCall, status: string) => void;

  constructor(
    context: ToolContext,
    onProgress?: (call: ToolCall, status: string) => void,
  ) {
    this.context = context;
    this.onProgress = onProgress;
  }

  addTool(call: ToolCall, tool: Tool | undefined): void {
    const isSafe = tool?.isConcurrencySafe ?? false;
    this.queue.push({ call, tool, isSafe, status: "queued" });
  }

  /**
   * 执行所有排队的工具并按顺序返回结果
   */
  async executeAll(): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    let i = 0;

    while (i < this.queue.length) {
      const batch = this.collectBatch(i);

      if (batch.length === 1) {
        const tracked = batch[0];
        tracked.status = "executing";
        this.onProgress?.(tracked.call, "executing");
        tracked.result = await this.executeSingle(tracked);
        tracked.status = "completed";
        results.push({
          id: tracked.call.id,
          name: tracked.call.name,
          result: tracked.result,
        });
        i++;
      } else {
        const promises = batch.map(async (tracked) => {
          tracked.status = "executing";
          this.onProgress?.(tracked.call, "executing");
          tracked.result = await this.executeSingle(tracked);
          tracked.status = "completed";
        });

        await Promise.all(promises);

        for (const tracked of batch) {
          results.push({
            id: tracked.call.id,
            name: tracked.call.name,
            result: tracked.result!,
          });
        }
        i += batch.length;
      }
    }

    return results;
  }

  /**
   * 从位置 startIdx 开始，收集一批可以并行执行的工具。
   *
   * 规则：
   * - 如果第一个工具不安全 → 单独执行
   * - 如果第一个安全 → 连续收集后续所有安全工具
   * - 遇到不安全工具时停止
   */
  private collectBatch(startIdx: number): TrackedTool[] {
    const first = this.queue[startIdx];
    if (!first.isSafe) return [first];

    const batch: TrackedTool[] = [first];
    for (let j = startIdx + 1; j < this.queue.length; j++) {
      if (!this.queue[j].isSafe) break;
      batch.push(this.queue[j]);
    }
    return batch;
  }

  private async executeSingle(tracked: TrackedTool): Promise<ToolResult> {
    if (!tracked.tool) {
      return { output: `Unknown tool: ${tracked.call.name}`, isError: true };
    }
    try {
      return await tracked.tool.call(tracked.call.input, this.context);
    } catch (err) {
      return {
        output: `Tool error: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
