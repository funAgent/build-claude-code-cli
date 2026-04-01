/**
 * s24 — Agent（自动压缩版）
 *
 * 在 s23 的基础上增加：
 * 1. 每轮对话结束后检查 token 使用量（shouldAutoCompact）
 * 2. 超过阈值时调用 compactConversation 生成摘要
 * 3. 用摘要替换旧消息，释放 context window 空间
 *
 * 核心思想：压缩不是删除历史，是用摘要替换细节——保留记忆的骨架。
 *
 * 对照 Claude Code: autoCompact.ts + compact.ts
 * 生产版在 query loop 内部调用 autoCompactIfNeeded()，
 * 支持 session memory compaction、forked agent 复用 cache、
 * PTL 重试、post-compact 文件附件恢复等。
 * 教学版简化为：阈值判断 → API 摘要 → 消息重建。
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
    | "compact_status"; // 新增：压缩状态通知
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
  // 持久化的消息列表——跨多次 run() 调用保留
  private messages: Anthropic.MessageParam[] = [];
  // 压缩状态跟踪
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

      let response: Anthropic.Message;
      try {
        response = await this.streamTurn(this.messages, onOutput);
      } catch {
        response = await this.fallbackNonStreaming(this.messages);
        const textContent = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
        if (textContent) {
          onOutput({ type: "text_delta", content: textContent });
          onOutput({ type: "text_done", content: "" });
        }
      }

      this.messages.push({ role: "assistant", content: response.content });

      // ── 自动压缩检查 ──────────────────────────────
      // 每轮结束后检查是否需要压缩上下文
      // 对照 Claude Code: autoCompactIfNeeded() 在 query loop 末尾调用
      await this.maybeCompact(onOutput);

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

  /**
   * 检查并执行自动压缩。
   *
   * 在每个 agent turn 结束后调用。
   * 如果当前 token 数超过阈值，执行压缩并替换 messages。
   */
  private async maybeCompact(
    onOutput: (output: AgentOutput) => void,
  ): Promise<void> {
    const { shouldCompact, tokenCount } = shouldAutoCompact(
      this.messages,
      this.compactState,
    );

    if (!shouldCompact) return;

    onOutput({
      type: "compact_status",
      content: `上下文接近上限 (~${tokenCount} tokens)，正在压缩...`,
    });

    const result = await compactConversation(
      this.messages,
      this.client,
      this.compactState,
      (status) => onOutput({ type: "compact_status", content: status }),
    );

    // 用压缩后的消息替换当前消息列表
    this.messages = result.messages;

    if (result.summary) {
      onOutput({
        type: "compact_status",
        content: `✓ 压缩完成: ${result.tokensBefore} → ${result.tokensAfter} tokens`,
      });
    }
  }

  /**
   * 获取当前上下文使用情况（供 UI 展示）
   */
  getContextUsage(): { tokens: number; percentage: number } {
    const tokens = estimateTokenCount(this.messages);
    return {
      tokens,
      percentage: Math.round((tokens / (STREAM_IDLE_TIMEOUT)) * 100),
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
