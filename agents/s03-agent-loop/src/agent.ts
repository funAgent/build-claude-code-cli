/**
 * s03 — Agent Loop：AI Agent 的核心
 *
 * 整个 AI Agent 的秘密就是一个 while 循环：
 *   1. 发送 messages 给模型
 *   2. 模型返回 text 或 tool_use
 *   3. 如果是 tool_use → 执行工具 → 把结果放回 messages → 回到 1
 *   4. 如果不是 tool_use → 完成
 *
 * 对照 Claude Code: query.ts 的 queryLoop 函数
 * 生产版用 while(true) + content 检测而非 stop_reason（因为 stop_reason 不总可靠）
 * 教学版用 stop_reason 判断，更直观
 */

import Anthropic from "@anthropic-ai/sdk";
import { execShell } from "./tools/bash.js";

const client = new Anthropic();

const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description:
      "Execute a shell command. Use this to explore files, run programs, install packages, etc. " +
      "The command runs in a sandboxed shell with timeout and output limits.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
      },
      required: ["command"],
    },
  },
];

const SYSTEM_PROMPT =
  "You are a helpful CLI assistant. You can execute shell commands using the bash tool. " +
  "When the user asks you to do something, break it down into steps and use tools as needed. " +
  "Always explain what you're doing and what the results mean.";

const MAX_TURNS = 10;

export async function runAgent(userMessage: string): Promise<void> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  console.log(`\nyou> ${userMessage}\n`);

  let turnCount = 0;

  // ═══ Agent Loop ═══
  // 这就是 AI Agent 的全部：一个 while 循环
  while (turnCount < MAX_TURNS) {
    turnCount++;

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    for (const block of assistantContent) {
      if (block.type === "text") {
        console.log(`assistant> ${block.text}\n`);
      }
    }

    // 关键判断：模型是否请求使用工具？
    if (response.stop_reason !== "tool_use") {
      break; // 模型说完了，退出循环
    }

    // 执行所有工具调用，收集结果
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of assistantContent) {
      if (block.type !== "tool_use") continue;

      const { id, name, input } = block;
      console.log(`  [tool] ${name}(${JSON.stringify(input)})`);

      if (name === "bash") {
        const { command } = input as { command: string };
        const result = await execShell(command);

        const output = result.timedOut
          ? `[超时] 命令被终止\n${result.stdout}`
          : result.stderr
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
      } else {
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: `Unknown tool: ${name}`,
          is_error: true,
        });
      }
    }

    // 把工具结果作为 user message 发回——这是 API 的协议要求
    messages.push({ role: "user", content: toolResults });
  }

  if (turnCount >= MAX_TURNS) {
    console.log("\n[system] 达到最大轮次限制，停止执行\n");
  }
}
