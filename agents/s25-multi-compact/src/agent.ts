/**
 * s25 — Agent（多层压缩版）
 *
 * 在 s24 的基础上升级为三层压缩策略：
 *
 * 1. 微压缩 (microcompact) — 每轮都检查，免费清理旧工具结果
 * 2. 自动压缩 (autocompact) — 超阈值时 API 摘要
 * 3. 响应式压缩 (reactive) — prompt-too-long 错误后紧急兜底
 * 加上 circuit breaker — 连续失败 3 次后停止尝试
 *
 * 策略递进：先免费 → 再收费 → 最后紧急。
 *
 * 对照 Claude Code: query.ts 的 agent loop 内部
 * - 每轮调用 microcompactMessages()（或 cached MC）
 * - autoCompactIfNeeded() 检查阈值
 * - 捕获 PROMPT_TOO_LONG → reactiveCompact()
 * - consecutiveFailures >= 3 → 熔断
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
import {
  shouldAutoCompact,
  compactConversation,
  reactiveCompact,
  tryMicroCompact,
  isPromptTooLongError,
  createCompactState,
  estimateTokenCount,
  type CompactState,
} from "./compact.js";

export interface AgentOutput {
  type:
    | "thinking_delta"
    | "text_delta"
    | "text_done"
    | "tool_start"
    | "tool_input_delta"
    | "tool_call"
    | "tool_result"
    | "parallel_info"
    | "compact_status";
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
  private messages: Anthropic.MessageParam[] = [];
  private compactState: CompactState;

  constructor(options: { readOnlyMode?: boolean } = {}) {
    this.registry = assembleToolPool(options);
    this.context = { cwd: process.cwd() };
    this.client = new Anthropic();
    this.compactState = createCompactState();

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
    this.messages.push({ role: "user", content: userMessage });

    let turns = 0;
    while (turns < MAX_TURNS) {
      turns++;

      // ── Layer 1: 微压缩 ─────────────────────────
      // 每轮开始前先做免费的清理
      const mcResult = tryMicroCompact(
        this.messages,
        this.compactState,
        (s) => onOutput({ type: "compact_status", content: s }),
      );
      this.messages = mcResult.messages;

      let response: Anthropic.Message;
      try {
        response = await this.streamTurn(this.messages, onOutput);
      } catch (error) {
        // ── Layer 3: Reactive Compact ───────────
        // 捕获 prompt-too-long 错误，紧急压缩后重试
        if (isPromptTooLongError(error)) {
          onOutput({
            type: "compact_status",
            content: "API 报错 prompt-too-long，触发 reactive compact...",
          });

          const reactiveResult = await reactiveCompact(
            this.messages,
            this.client,
            this.compactState,
            (s) => onOutput({ type: "compact_status", content: s }),
          );

          this.messages = reactiveResult.messages;

          if (!reactiveResult.success) {
            onOutput({
              type: "text_delta",
              content: "上下文压缩失败，请尝试开启新对话。",
            });
            onOutput({ type: "text_done", content: "" });
            return;
          }

          // 压缩成功后重试
          try {
            response = await this.streamTurn(this.messages, onOutput);
          } catch {
            response = await this.fallbackNonStreaming(this.messages);
            this.emitTextFromResponse(response, onOutput);
          }
        } else {
          response = await this.fallbackNonStreaming(this.messages);
          this.emitTextFromResponse(response, onOutput);
        }
      }

      this.messages.push({ role: "assistant", content: response.content });

      // ── Layer 2: 自动压缩检查 ─────────────────
      await this.maybeAutoCompact(onOutput);

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

      this.messages.push({ role: "user", content: results });
    }
  }

  private emitTextFromResponse(
    response: Anthropic.Message,
    onOutput: (output: AgentOutput) => void,
  ): void {
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text) {
      onOutput({ type: "text_delta", content: text });
      onOutput({ type: "text_done", content: "" });
    }
  }

  private async maybeAutoCompact(
    onOutput: (output: AgentOutput) => void,
  ): Promise<void> {
    const { shouldCompact, tokenCount } = shouldAutoCompact(
      this.messages,
      this.compactState,
    );

    if (!shouldCompact) return;

    onOutput({
      type: "compact_status",
      content: `上下文接近上限 (~${tokenCount} tokens)，启动多层压缩...`,
    });

    // 先尝试微压缩
    const mcResult = tryMicroCompact(
      this.messages,
      this.compactState,
      (s) => onOutput({ type: "compact_status", content: s }),
    );
    this.messages = mcResult.messages;

    // 微压缩够了就返回
    if (mcResult.sufficient) {
      onOutput({
        type: "compact_status",
        content: "✓ 微压缩释放了足够空间",
      });
      return;
    }

    // 微压缩不够，升级为 API 摘要压缩
    const result = await compactConversation(
      this.messages,
      this.client,
      this.compactState,
      (s) => onOutput({ type: "compact_status", content: s }),
    );

    this.messages = result.messages;

    if (result.summary) {
      onOutput({
        type: "compact_status",
        content: `✓ 压缩完成: ${result.tokensBefore} → ${result.tokensAfter} tokens`,
      });
    }
  }

  getContextUsage(): { tokens: number; percentage: number } {
    const tokens = estimateTokenCount(this.messages);
    return {
      tokens,
      percentage: Math.round((tokens / STREAM_IDLE_TIMEOUT) * 100),
    };
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
