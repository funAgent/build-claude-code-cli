/**
 * s13 — Agent（输出回调化）
 *
 * 关键变化：不再 console.log，而是通过 onOutput 回调推送结构化输出。
 * 这让 Agent 与 UI 层完全解耦——你可以接 Ink、接 Web、接测试。
 *
 * 对照 Claude Code: query.ts 的输出也不直接写终端，
 * 而是通过 React 状态驱动 Ink 组件渲染。
 */

import Anthropic from "@anthropic-ai/sdk";
import { type ToolContext } from "./tool.js";
import { assembleToolPool, type ToolRegistry } from "./tools.js";

export interface AgentOutput {
  type: "assistant" | "tool_call" | "tool_result";
  content: string;
}

const SYSTEM_PROMPT = "You are a helpful CLI assistant. Use glob/grep to find files before editing. Prefer file_edit over file_write for existing files. Be concise.";
const MAX_TURNS = 15;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export class Agent {
  private registry: ToolRegistry;
  private context: ToolContext;
  private client: Anthropic;

  constructor(options: { readOnlyMode?: boolean } = {}) {
    this.registry = assembleToolPool(options);
    this.context = { cwd: process.cwd() };
    this.client = new Anthropic();
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
        system: SYSTEM_PROMPT,
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
