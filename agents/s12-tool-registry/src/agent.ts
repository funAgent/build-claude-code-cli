/**
 * s12 — Agent with tool registry
 *
 * 使用 assembleToolPool 注册表替代手动工具数组。
 * 支持只读模式（过滤掉写工具）。
 *
 * 对照 Claude Code: query.ts + tools.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { type ToolContext } from "./tool.js";
import { assembleToolPool, type ToolRegistry } from "./tools.js";

const client = new Anthropic();
const SYSTEM_PROMPT = "You are a helpful CLI assistant. Use glob/grep to find files before editing. Prefer file_edit over file_write for existing files. Be concise.";
const MAX_TURNS = 15;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export class Agent {
  private registry: ToolRegistry;
  private context: ToolContext;

  constructor(options: { readOnlyMode?: boolean } = {}) {
    this.registry = assembleToolPool(options);
    this.context = { cwd: process.cwd() };
  }

  async run(userMessage: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    console.log(`\nyou> ${userMessage}\n`);

    let turns = 0;
    while (turns < MAX_TURNS) {
      turns++;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: this.registry.toApiTools(),
        messages,
      });

      messages.push({ role: "assistant", content: response.content });
      for (const b of response.content) {
        if (b.type === "text") console.log(`assistant> ${b.text}\n`);
      }

      if (response.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of response.content) {
        if (b.type !== "tool_use") continue;
        const tool = this.registry.get(b.name);
        console.log(`  [tool] ${b.name}(${JSON.stringify(b.input)})`);

        if (!tool) {
          results.push({
            type: "tool_result",
            tool_use_id: b.id,
            content: `Unknown tool: ${b.name}`,
            is_error: true,
          });
          continue;
        }

        const r = await tool.call(b.input as Record<string, unknown>, this.context);
        const preview = r.output.slice(0, 300);
        console.log(`  [result] ${preview}${r.output.length > 300 ? "..." : ""}\n`);

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

  listTools(): void {
    console.log("\n--- 工具列表 ---");
    const tools = this.registry.getAll();
    tools.forEach((t, i) => {
      const mode = t.isReadOnly ? "只读" : "读写";
      console.log(`  ${i + 1}. ${t.name} [${mode}] — ${t.description.slice(0, 60)}`);
    });
    console.log(`\n共 ${tools.length} 个工具 (${this.registry.getReadOnly().length} 只读 / ${this.registry.getWritable().length} 读写)`);
  }
}
