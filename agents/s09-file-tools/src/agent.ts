/**
 * s09 — Agent with file tools
 *
 * 新增 file_read 和 file_write 两个工具。
 * 循环逻辑完全不变——只在 tools 数组中多了两项。
 */

import Anthropic from "@anthropic-ai/sdk";
import { type Tool, type ToolContext, toAnthropicTools } from "./tool.js";
import { bashTool } from "./tools/bash.js";
import { fileReadTool } from "./tools/file-read.js";
import { fileWriteTool } from "./tools/file-write.js";

const client = new Anthropic();
const SYSTEM_PROMPT = "You are a helpful CLI assistant. Use tools as needed. Be concise.";
const MAX_TURNS = 10;
const MODEL = "claude-sonnet-4-20250514";

export class Agent {
  private tools: Tool[];
  private toolMap: Map<string, Tool>;
  private context: ToolContext;

  constructor() {
    this.tools = [bashTool, fileReadTool, fileWriteTool];
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
    this.context = { cwd: process.cwd() };
  }

  async run(userMessage: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    console.log(`\nyou> ${userMessage}\n`);

    let turnCount = 0;
    while (turnCount < MAX_TURNS) {
      turnCount++;
      const response = await client.messages.create({
        model: MODEL, max_tokens: 4096, system: SYSTEM_PROMPT,
        tools: toAnthropicTools(this.tools), messages,
      });

      messages.push({ role: "assistant", content: response.content });
      for (const block of response.content) {
        if (block.type === "text") console.log(`assistant> ${block.text}\n`);
      }
      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const tool = this.toolMap.get(block.name);
        console.log(`  [tool] ${block.name}(${JSON.stringify(block.input)})`);

        if (!tool) {
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true });
          continue;
        }

        const result = await tool.call(block.input as Record<string, unknown>, this.context);
        const preview = result.output.slice(0, 300);
        console.log(`  [result] ${preview}${result.output.length > 300 ? "..." : ""}\n`);
        toolResults.push({
          type: "tool_result", tool_use_id: block.id, content: result.output,
          ...(result.isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }
}
