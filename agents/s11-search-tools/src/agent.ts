/**
 * s11 — Agent with 6 tools (bash + file_read/write/edit + glob + grep)
 */
import Anthropic from "@anthropic-ai/sdk";
import { type Tool, type ToolContext, toAnthropicTools } from "./tool.js";
import { bashTool } from "./tools/bash.js";
import { fileReadTool } from "./tools/file-read.js";
import { fileWriteTool } from "./tools/file-write.js";
import { fileEditTool } from "./tools/file-edit.js";
import { globTool } from "./tools/glob.js";
import { grepTool } from "./tools/grep.js";

const client = new Anthropic();
const SYSTEM_PROMPT = "You are a helpful CLI assistant. Use glob/grep to find files before editing. Prefer file_edit over file_write for existing files. Be concise.";
const MAX_TURNS = 15;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export class Agent {
  private tools: Tool[];
  private toolMap: Map<string, Tool>;
  private context: ToolContext;

  constructor() {
    this.tools = [bashTool, fileReadTool, fileWriteTool, fileEditTool, globTool, grepTool];
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));
    this.context = { cwd: process.cwd() };
  }

  async run(userMessage: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    console.log(`\nyou> ${userMessage}\n`);
    let turns = 0;
    while (turns < MAX_TURNS) {
      turns++;
      const response = await client.messages.create({
        model: MODEL, max_tokens: 4096, system: SYSTEM_PROMPT,
        tools: toAnthropicTools(this.tools), messages,
      });
      messages.push({ role: "assistant", content: response.content });
      for (const b of response.content) { if (b.type === "text") console.log(`assistant> ${b.text}\n`); }
      if (response.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const b of response.content) {
        if (b.type !== "tool_use") continue;
        const tool = this.toolMap.get(b.name);
        console.log(`  [tool] ${b.name}(${JSON.stringify(b.input)})`);
        if (!tool) { results.push({ type: "tool_result", tool_use_id: b.id, content: `Unknown: ${b.name}`, is_error: true }); continue; }
        const r = await tool.call(b.input as Record<string, unknown>, this.context);
        console.log(`  [result] ${r.output.slice(0, 300)}${r.output.length > 300 ? "..." : ""}\n`);
        results.push({ type: "tool_result", tool_use_id: b.id, content: r.output, ...(r.isError ? { is_error: true } : {}) });
      }
      messages.push({ role: "user", content: results });
    }
  }
}
