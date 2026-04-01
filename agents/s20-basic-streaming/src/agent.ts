/**
 * s20 — Agent（基础 Streaming 版）
 *
 * 关键变化：使用 stream() 替代 create()，逐 token 推送文本。
 * 用户不再等待完整响应，而是看到文字"流"出来。
 *
 * 核心事件：
 * - content_block_start: 新 content block 开始
 * - content_block_delta: 增量文本/JSON
 * - content_block_stop: block 结束
 * - message_start / message_stop: 消息级别
 *
 * 对照 Claude Code: services/api/claude.ts 的 queryModel async generator
 * 生产版用 raw Stream<BetaRawMessageStreamEvent> 而非 SDK stream helper
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
  type: "text_delta" | "text_done" | "tool_call" | "tool_result";
  content: string;
}

const MAX_TURNS = 15;
const MODEL = "claude-sonnet-4-20250514";

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

      // 核心变化：stream() 替代 create()
      // create() 等全部生成完才返回；stream() 逐 token 推送
      const stream = this.client.messages.stream({
        model: MODEL,
        max_tokens: 4096,
        system: this.buildSystemParam(),
        tools: this.registry.toApiTools(),
        messages,
      });

      // SDK 高层 API：每收到一段文本就触发回调
      // 底层其实是 SSE (Server-Sent Events)，SDK 帮我们解析了
      stream.on("text", (text) => {
        onOutput({ type: "text_delta", content: text });
      });

      // finalMessage() 等待流完成，返回完整 Message 对象
      // 用于后续工具调用循环——工具调用仍需要完整的 content blocks
      const response = await stream.finalMessage();

      onOutput({ type: "text_done", content: "" });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of response.content) {
        if (b.type !== "tool_use") continue;
        const tool = this.registry.get(b.name);
        onOutput({
          type: "tool_call",
          content: `${b.name}(${JSON.stringify(b.input).slice(0, 120)})`,
        });

        if (!tool) {
          results.push({
            type: "tool_result", tool_use_id: b.id,
            content: `Unknown tool: ${b.name}`, is_error: true,
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
          type: "tool_result", tool_use_id: b.id, content: r.output,
          ...(r.isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: "user", content: results });
    }
  }
}
