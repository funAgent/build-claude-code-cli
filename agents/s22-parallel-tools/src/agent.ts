/**
 * s22 — Agent（工具并行执行版）
 *
 * 在 s21 的基础上增加：
 * 1. StreamingToolExecutor 管理工具执行并发
 * 2. 安全工具（读操作）自动并行，危险工具（写操作）串行
 * 3. 结果按原始顺序返回，保证对话一致性
 *
 * 执行流程：
 *   stream events → 收集所有 tool_use blocks
 *                 → StreamingToolExecutor 分批并行执行
 *                 → 按序返回结果
 *
 * 对照 Claude Code: StreamingToolExecutor.ts
 * 生产版在流式接收过程中就开始执行已解析的工具（边收边执行）
 * 教学版简化为"收集完再分批执行"，聚焦并行策略
 */

import Anthropic from "@anthropic-ai/sdk";
import { type ToolContext } from "./tool.js";
import { assembleToolPool, type ToolRegistry } from "./tools.js";
import {
  buildSystemPrompt,
  splitPromptForCache,
  type SystemPromptBlock,
} from "./prompt.js";
import { StreamingToolExecutor, type ToolCall } from "./tool-executor.js";

export interface AgentOutput {
  type:
    | "thinking_delta"
    | "text_delta"
    | "text_done"
    | "tool_start"
    | "tool_input_delta"
    | "tool_call"
    | "tool_result"
    | "parallel_info";
  content: string;
  toolName?: string;
}

const MAX_TURNS = 15;
const MODEL = "claude-sonnet-4-20250514";
const STREAM_IDLE_TIMEOUT = 60_000;

export class Agent {
  private registry: ToolRegistry;
  private context: ToolContext;
  private client: Anthropic;
  private systemBlocks: SystemPromptBlock[];

  constructor(options: { readOnlyMode?: boolean } = {}) {
    this.registry = assembleToolPool(options);
    this.context = { cwd: process.cwd() };
    this.client = new Anthropic();

    const sections = buildSystemPrompt(
      this.registry.getAll(),
      this.context.cwd,
    );
    this.systemBlocks = splitPromptForCache(sections);
  }

  private buildSystemParam(): Anthropic.TextBlockParam[] {
    return this.systemBlocks.map((block) => ({
      type: "text" as const,
      text: block.text,
      ...(block.cacheScope
        ? { cache_control: { type: block.cacheScope } }
        : {}),
    }));
  }

  async run(
    userMessage: string,
    onOutput: (output: AgentOutput) => void,
  ): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    let turns = 0;
    while (turns < MAX_TURNS) {
      turns++;

      let response: Anthropic.Message;
      try {
        response = await this.streamTurn(messages, onOutput);
      } catch {
        response = await this.fallbackNonStreaming(messages);
        const textContent = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (textContent) {
          onOutput({ type: "text_delta", content: textContent });
          onOutput({ type: "text_done", content: "" });
        }
      }

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") break;

      const toolCalls: ToolCall[] = [];
      for (const b of response.content) {
        if (b.type !== "tool_use") continue;
        toolCalls.push({
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        });
      }

      const executor = new StreamingToolExecutor(
        this.context,
        (call, status) => {
          if (status === "executing") {
            onOutput({
              type: "tool_call",
              content: `${call.name}(${JSON.stringify(call.input).slice(0, 120)})`,
              toolName: call.name,
            });
          }
        },
      );

      for (const tc of toolCalls) {
        executor.addTool(tc, this.registry.get(tc.name));
      }

      const safeCount = toolCalls.filter(
        (tc) => this.registry.get(tc.name)?.isConcurrencySafe,
      ).length;
      if (safeCount > 1) {
        onOutput({
          type: "parallel_info",
          content: `并行执行 ${safeCount} 个安全工具`,
        });
      }

      const toolResults = await executor.executeAll();

      const results: Anthropic.ToolResultBlockParam[] = toolResults.map(
        (tr) => {
          const preview = tr.result.output.slice(0, 200);
          onOutput({
            type: "tool_result",
            content: `${tr.name}: ${preview}${tr.result.output.length > 200 ? "…" : ""}`,
          });
          return {
            type: "tool_result" as const,
            tool_use_id: tr.id,
            content: tr.result.output,
            ...(tr.result.isError ? { is_error: true } : {}),
          };
        },
      );

      messages.push({ role: "user", content: results });
    }
  }

  private async streamTurn(
    messages: Anthropic.MessageParam[],
    onOutput: (output: AgentOutput) => void,
  ): Promise<Anthropic.Message> {
    const stream = this.client.messages.stream({
      model: MODEL,
      max_tokens: 16384,
      system: this.buildSystemParam(),
      tools: this.registry.toApiTools(),
      messages,
    });

    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const resetWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => stream.abort(), STREAM_IDLE_TIMEOUT);
    };

    resetWatchdog();

    stream.on("event", (event) => {
      resetWatchdog();

      switch (event.type) {
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "tool_use") {
            onOutput({ type: "tool_start", content: block.name, toolName: block.name });
          }
          break;
        }
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "thinking_delta") {
            onOutput({ type: "thinking_delta", content: delta.thinking });
          } else if (delta.type === "text_delta") {
            onOutput({ type: "text_delta", content: delta.text });
          } else if (delta.type === "input_json_delta") {
            onOutput({ type: "tool_input_delta", content: delta.partial_json });
          }
          break;
        }
      }
    });

    const finalMessage = await stream.finalMessage();
    if (watchdog) clearTimeout(watchdog);
    onOutput({ type: "text_done", content: "" });
    return finalMessage;
  }

  private async fallbackNonStreaming(
    messages: Anthropic.MessageParam[],
  ): Promise<Anthropic.Message> {
    return await this.client.messages.create({
      model: MODEL,
      max_tokens: 16384,
      system: this.buildSystemParam(),
      tools: this.registry.toApiTools(),
      messages,
    });
  }
}
