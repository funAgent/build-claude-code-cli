/**
 * s26 — Agent（大输出处理版）
 *
 * 在 s25 的多层压缩基础上增加：
 * 1. 工具结果大小检查：超过 50K 字符的结果持久化到磁盘
 * 2. Per-message 预算控制：每条消息的工具结果总量不超过 200K 字符
 * 3. Content Replacement State：确保替换后的内容在后续 API 调用中稳定
 *
 * 核心思想：工具结果可能比对话本身还大——
 * 必须有预算控制和磁盘替换机制。
 *
 * 对照 Claude Code: utils/toolResultStorage.ts
 * - processToolResultBlock: 大结果持久化
 * - applyToolResultBudget: per-message 预算
 * - ContentReplacementState: cache-stable replay
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
import {
  processToolResult,
  applyToolResultBudget,
  createContentReplacementState,
  type ContentReplacementState,
} from "./tool-result-storage.js";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

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
    | "compact_status"
    | "budget_status"; // 新增：预算控制状态
  content: string;
  toolName?: string;
}

const MAX_TURNS = 15;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";
const STREAM_IDLE_TIMEOUT = 60_000;

export class Agent {
  private registry: ToolRegistry;
  private context: ToolContext;
  private client: Anthropic;
  private systemBlocks: SystemPromptBlock[];
  private messages: Anthropic.MessageParam[] = [];
  private compactState: CompactState;
  // 工具结果预算控制状态
  private contentReplacementState: ContentReplacementState;
  // 会话目录，用于持久化大型工具结果
  private sessionDir: string;

  constructor(options: { readOnlyMode?: boolean } = {}) {
    this.registry = assembleToolPool(options);
    this.context = { cwd: process.cwd() };
    this.client = new Anthropic();
    this.compactState = createCompactState();
    this.contentReplacementState = createContentReplacementState();

    // 创建会话目录
    this.sessionDir = join(
      process.cwd(),
      ".agent-sessions",
      Date.now().toString(36),
    );
    if (!existsSync(this.sessionDir)) {
      mkdirSync(this.sessionDir, { recursive: true });
    }

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

      // Layer 1: 微压缩
      const mcResult = tryMicroCompact(
        this.messages,
        this.compactState,
        (s) => onOutput({ type: "compact_status", content: s }),
      );
      this.messages = mcResult.messages;

      // 应用工具结果预算（在 API 调用前）
      this.applyBudget(onOutput);

      let response: Anthropic.Message;
      try {
        response = await this.streamTurn(this.messages, onOutput);
      } catch (error) {
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

      // Layer 2: 自动压缩检查
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

      // ── 工具结果大小检查 + 持久化 ────────────────
      const results: Anthropic.ToolResultBlockParam[] = toolResults.map(
        (tr) => {
          // 检查是否需要持久化
          const processed = processToolResult(
            tr.id,
            tr.result.output,
            this.sessionDir,
          );

          if (processed.persisted) {
            onOutput({
              type: "budget_status",
              content: `📦 ${tr.name}: 输出过大 (${tr.result.output.length} 字符)，已持久化到磁盘`,
            });
          }

          const preview = processed.content.slice(0, 200);
          onOutput({
            type: "tool_result",
            content: `${tr.name}: ${preview}${processed.content.length > 200 ? "…" : ""}`,
          });

          return {
            type: "tool_result" as const,
            tool_use_id: tr.id,
            content: processed.content,
            ...(tr.result.isError ? { is_error: true } : {}),
          };
        },
      );

      this.messages.push({ role: "user", content: results });
    }
  }

  /**
   * 应用工具结果预算控制。
   * 在发送 API 调用前，确保消息列表中的工具结果不超预算。
   */
  private applyBudget(onOutput: (output: AgentOutput) => void): void {
    const { replacedCount } = applyToolResultBudget(
      this.messages as Array<{ role: string; content: unknown }>,
      this.contentReplacementState,
      this.sessionDir,
    );

    if (replacedCount > 0) {
      onOutput({
        type: "budget_status",
        content: `预算控制: ${replacedCount} 个工具结果被替换为磁盘预览`,
      });
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

    const mcResult = tryMicroCompact(
      this.messages,
      this.compactState,
      (s) => onOutput({ type: "compact_status", content: s }),
    );
    this.messages = mcResult.messages;

    if (mcResult.sufficient) {
      onOutput({ type: "compact_status", content: "✓ 微压缩释放了足够空间" });
      return;
    }

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
