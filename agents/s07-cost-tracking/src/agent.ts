/**
 * s07 — Agent with cost tracking
 *
 * 在每次 API 调用后累加 usage，实时显示成本。
 */

import Anthropic from "@anthropic-ai/sdk";
import { execShell } from "./tools/bash.js";
import { withRetry } from "./retry.js";
import { CostTracker } from "./cost-tracker.js";

const client = new Anthropic();

const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description: "Execute a shell command.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "The shell command to execute" },
      },
      required: ["command"],
    },
  },
];

const SYSTEM_PROMPT =
  "You are a helpful CLI assistant. Execute shell commands as needed. Be concise.";

const MAX_TURNS = 10;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export class Agent {
  private tracker: CostTracker;

  constructor() {
    this.tracker = new CostTracker(MODEL);
  }

  async run(userMessage: string): Promise<void> {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    console.log(`\nyou> ${userMessage}\n`);

    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      let response: Anthropic.Message;
      try {
        response = await withRetry(() =>
          client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages,
          })
        );
      } catch (error) {
        console.log(`\n[error] ${error instanceof Error ? error.message : error}\n`);
        return;
      }

      this.tracker.addUsage(response.usage);

      messages.push({ role: "assistant", content: response.content });

      for (const block of response.content) {
        if (block.type === "text") {
          console.log(`assistant> ${block.text}`);
          console.log(`  ${this.tracker.getInlineStatus()}\n`);
        }
      }

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const { id, name, input } = block;
        console.log(`  [tool] ${name}(${JSON.stringify(input)})`);

        if (name === "bash") {
          try {
            const result = await execShell((input as { command: string }).command);
            const output = result.stderr
              ? `${result.stdout}\nstderr: ${result.stderr}\nexit: ${result.exitCode}`
              : result.stdout || "(no output)";
            console.log(`  [result] ${output.slice(0, 200)}${output.length > 200 ? "..." : ""}\n`);
            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: output,
              ...(result.exitCode !== 0 ? { is_error: true } : {}),
            });
          } catch (e) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: id,
              content: `Error: ${e instanceof Error ? e.message : e}`,
              is_error: true,
            });
          }
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: `Unknown tool: ${name}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: "user", content: toolResults });
    }
  }

  showCost(): void {
    this.tracker.showCost();
  }
}
