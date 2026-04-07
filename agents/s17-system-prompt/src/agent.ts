/**
 * s17 — Agent（使用分层 System Prompt）
 *
 * 关键变化：system prompt 不再是硬编码字符串，
 * 而是由 buildSystemPrompt() 按层组装。
 *
 * 对照 Claude Code: query.ts 调用 getSystemPrompt() 动态构建
 */

import Anthropic from "@anthropic-ai/sdk";
import { type ToolContext } from "./tool.js";
import { assembleToolPool, type ToolRegistry } from "./tools.js";
import { buildSystemPrompt, sectionsToString } from "./prompt.js";

export interface AgentOutput {
  type: "assistant" | "tool_call" | "tool_result";
  content: string;
}

const MAX_TURNS = 15;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export class Agent {
  private registry: ToolRegistry;
  private context: ToolContext;
  private client: Anthropic;
  private systemPrompt: string;

  constructor(options: { readOnlyMode?: boolean } = {}) {
    this.registry = assembleToolPool(options);
    this.context = { cwd: process.cwd() };
    this.client = new Anthropic();

    const sections = buildSystemPrompt(
      this.registry.getAll(),
      this.context.cwd,
    );
    this.systemPrompt = sectionsToString(sections);
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

      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: this.systemPrompt,
        tools: this.registry.toApiTools(),
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      for (const b of response.content) {
        if (b.type === "text") {
          onOutput({ type: "assistant", content: b.text });
        }
      }

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
}
