/**
 * s21 — Agent（Streaming 进阶版）
 *
 * 在 s20 的基础上增加：
 * 1. extended thinking 流式 — thinking block 实时推送
 * 2. tool_use 流式解析 — 工具调用的 JSON 是增量到达的
 * 3. watchdog 超时 — 流式卡住时自动回退
 * 4. 非流式回退 — streaming 失败时降级为 create()
 *
 * 使用 raw event 处理替代高层 stream() helper：
 * - message_start: 消息开始
 * - content_block_start: 新 block 开始（text / thinking / tool_use）
 * - content_block_delta: 增量数据
 * - content_block_stop: block 结束
 * - message_delta: 消息级别的 stop_reason / usage
 * - message_stop: 消息结束
 *
 * 对照 Claude Code: services/api/claude.ts
 * 生产版用 BetaRawMessageStreamEvent + async generator
 * 教学版简化为回调式事件分发
 */

import Anthropic from "@anthropic-ai/sdk";
import { type ToolContext } from "./tool.js";
import { assembleToolPool, type ToolRegistry } from "./tools.js";
import {
  buildSystemPrompt,
  splitPromptForCache,
  type SystemPromptBlock,
} from "./prompt.js";

export interface AgentOutput {
  type:
    | "thinking_delta"
    | "thinking_done"
    | "text_delta"
    | "text_done"
    | "tool_start"
    | "tool_input_delta"
    | "tool_call"
    | "tool_result";
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
      } catch (err) {
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

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of response.content) {
        if (b.type !== "tool_use") continue;
        const tool = this.registry.get(b.name);
        onOutput({
          type: "tool_call",
          content: `${b.name}(${JSON.stringify(b.input).slice(0, 120)})`,
          toolName: b.name,
        });

        if (!tool) {
          results.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: `Unknown tool: ${b.name}`,
            is_error: true,
          });
          continue;
        }

        const r = await tool.call(
          b.input as Record<string, unknown>,
          this.context,
        );
        const preview = r.output.slice(0, 200);
        onOutput({
          type: "tool_result",
          content: `${preview}${r.output.length > 200 ? "…" : ""}`,
        });

        results.push({
          type: "tool_result",
          tool_use_id: b.id,
          content: r.output,
          ...(r.isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: "user", content: results });
    }
  }

  /**
   * 流式请求一个 turn，返回完整 Message 用于后续对话
   */
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

    // Watchdog：防止流式卡死。每收到事件就重置计时器，
    // 60s 无事件 → abort 流 → 抛出错误 → catch 中回退到 create()
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const resetWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        stream.abort();
      }, STREAM_IDLE_TIMEOUT);
    };

    resetWatchdog();

    // 工具 JSON 是增量到达的：{"pa → th": → "/sr → c/agent.ts"}
    // 需要按 block index 分别累积每个工具的 JSON 片段
    const toolInputBuffers = new Map<number, { name: string; json: string }>();

    // 监听底层事件而非高层 API，以处理 thinking 和 tool_use
    stream.on("event", (event) => {
      resetWatchdog();

      switch (event.type) {
        // 新 content block 开始——区分三种类型
        case "content_block_start": {
          const block = event.content_block;
          if (block.type === "thinking") {
            // thinking block：AI 的内部推理过程
            onOutput({ type: "thinking_delta", content: "" });
          } else if (block.type === "tool_use") {
            // tool_use block：工具调用开始，JSON 参数将逐步到达
            toolInputBuffers.set(event.index, {
              name: block.name,
              json: "",
            });
            onOutput({ type: "tool_start", content: block.name, toolName: block.name });
          }
          break;
        }

        // 增量内容——根据 delta 类型分发
        case "content_block_delta": {
          const delta = event.delta;
          if (delta.type === "thinking_delta") {
            onOutput({ type: "thinking_delta", content: delta.thinking });
          } else if (delta.type === "text_delta") {
            onOutput({ type: "text_delta", content: delta.text });
          } else if (delta.type === "input_json_delta") {
            // 工具参数 JSON 的增量片段，拼接到 buffer 中
            const buf = toolInputBuffers.get(event.index);
            if (buf) {
              buf.json += delta.partial_json;
              onOutput({
                type: "tool_input_delta",
                content: delta.partial_json,
                toolName: buf.name,
              });
            }
          }
          break;
        }

        // block 结束——清理 buffer（完整 JSON 在 finalMessage 中）
        case "content_block_stop": {
          const buf = toolInputBuffers.get(event.index);
          if (buf) {
            toolInputBuffers.delete(event.index);
          }
          break;
        }

        case "message_delta": {
          // message_delta 包含 stop_reason 和 usage，由 finalMessage 处理
          break;
        }
      }
    });

    const finalMessage = await stream.finalMessage();

    if (watchdog) clearTimeout(watchdog);

    onOutput({ type: "text_done", content: "" });

    return finalMessage;
  }

  /**
   * 非流式回退 — 当 streaming 失败时降级
   */
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
