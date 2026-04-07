/**
 * s08 — 使用 Tool 接口的 Agent
 *
 * 循环逻辑只依赖 Tool 接口，通过 name 查找工具实例调用。
 * 新增工具只需在 tools 数组中添加，无需修改循环。
 *
 * 对照 Claude Code: query.ts + tools.ts
 * 生产版通过 assembleToolPool 组装工具列表
 */

import Anthropic from "@anthropic-ai/sdk";
import { type Tool, type ToolContext, toAnthropicTools } from "./tool.js";
import { bashTool } from "./tools/bash.js";

const client = new Anthropic();

const SYSTEM_PROMPT =
  "You are a helpful CLI assistant. Use tools as needed. Be concise.";
const MAX_TURNS = 10;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export class Agent {
  private tools: Tool[];
  private toolMap: Map<string, Tool>;
  private context: ToolContext;

  constructor() {
    this.tools = [bashTool];
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
    this.context = { cwd: process.cwd() };
  }

  async run(userMessage: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    console.log(`\nyou> ${userMessage}\n`);

    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: toAnthropicTools(this.tools),
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      for (const block of response.content) {
        if (block.type === "text") {
          console.log(`assistant> ${block.text}\n`);
        }
      }

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const tool = this.toolMap.get(block.name);
        console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);

        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
          continue;
        }

        const result = await tool.call(
          block.input as Record<string, unknown>,
          this.context
        );

        const preview = result.output.slice(0, 200);
        console.log(`  [result] ${preview}${result.output.length > 200 ? "..." : ""}\n`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.output,
          ...(result.isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}
