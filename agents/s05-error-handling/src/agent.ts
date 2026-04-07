/**
 * s05 — Agent with error handling
 *
 * 两种错误策略：
 * 1. API 错误（网络/限流/服务端）→ 指数退避重试
 * 2. 工具错误（命令失败）→ 作为 tool_result(is_error:true) 返回，让模型自修正
 *
 * 关键原则：不要 catch 然后 crash，把错误告诉模型让它修正
 *
 * 对照 Claude Code: query.ts 的错误恢复管道
 * 生产版策略栈：重试 → prompt-too-long 压缩 → 降级备用模型 → 恢复消息 → circuit breaker
 */

import Anthropic from "@anthropic-ai/sdk";
import { execShell } from "./tools/bash.js";
import { withRetry } from "./retry.js";

const client = new Anthropic();
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description:
      "Execute a shell command. Use this to explore files, run programs, etc.",
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
  "You are a helpful CLI assistant. If a command fails, analyze the error and try a different approach. " +
  "Don't give up after one failure — try to fix the issue yourself.";

const MAX_TURNS = 10;

export async function runAgent(userMessage: string): Promise<void> {
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
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(`\n[error] API 调用失败: ${errMsg}\n`);
      console.log("[system] 已用尽所有重试机会，停止执行\n");
      return;
    }

    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    for (const block of assistantContent) {
      if (block.type === "text") {
        console.log(`assistant> ${block.text}\n`);
      }
    }

    if (response.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      const { id, name, input } = block;
      console.log(`  [tool] ${name}(${JSON.stringify(input)})`);

      if (name === "bash") {
        const { command } = input as { command: string };

        try {
          const result = await execShell(command);

          const output = result.timedOut
            ? `[超时] 命令被终止\n${result.stdout}`
            : result.stderr
              ? `${result.stdout}\nstderr: ${result.stderr}\nexit: ${result.exitCode}`
              : result.stdout || "(no output)";

          const isError = result.exitCode !== 0;
          if (isError) {
            console.log(`  [error] 命令失败 (exit ${result.exitCode})，将错误送回模型自修正\n`);
          } else {
            const preview = output.slice(0, 200) + (output.length > 200 ? "..." : "");
            console.log(`  [result] ${preview}\n`);
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: output,
            ...(isError ? { is_error: true } : {}),
          });
        } catch (toolError) {
          const errMsg = toolError instanceof Error ? toolError.message : String(toolError);
          console.log(`  [error] 工具执行异常: ${errMsg}\n`);

          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: `Tool execution error: ${errMsg}`,
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

  if (turnCount >= MAX_TURNS) {
    console.log("\n[system] 达到最大轮次限制\n");
  }
}
