/**
 * s06 — Agent（从配置读取参数，不再硬编码）
 */

import Anthropic from "@anthropic-ai/sdk";
import { execShell } from "./tools/bash.js";
import { withRetry } from "./retry.js";
import type { AppConfig } from "./config.js";

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

export async function runAgent(userMessage: string, config: AppConfig): Promise<void> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  console.log(`\nyou> ${userMessage}\n`);

  let turnCount = 0;

  while (turnCount < config.maxTurns) {
    turnCount++;

    let response: Anthropic.Message;
    try {
      response = await withRetry(() =>
        client.messages.create({
          model: config.model,
          max_tokens: 4096,
          system: config.systemPrompt,
          tools: TOOLS,
          messages,
        })
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n[error] API 调用失败: ${errMsg}\n`);
      return;
    }

    messages.push({ role: "assistant", content: response.content });

    for (const block of response.content) {
      if (block.type === "text") console.log(`assistant> ${block.text}\n`);
    }

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      const { id, name, input } = block;
      console.log(`  [tool] ${name}(${JSON.stringify(input)})`);

      if (name === "bash") {
        try {
          const result = await execShell((input as { command: string }).command, {
            timeout: config.timeout,
            maxOutput: config.maxOutput,
          });
          const output = result.stderr
            ? `${result.stdout}\nstderr: ${result.stderr}\nexit: ${result.exitCode}`
            : result.stdout || "(no output)";
          const preview = output.slice(0, 200) + (output.length > 200 ? "..." : "");
          console.log(`  [result] ${preview}\n`);
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
            content: `Error: ${e instanceof Error ? e.message : String(e)}`,
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
