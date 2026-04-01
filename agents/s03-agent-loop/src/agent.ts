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

    // 每次循环就是一次 API 调用——整个 messages 历史都发过去
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      // tools 参数告诉模型它可以使用哪些工具
      // 模型会在 content 中返回 tool_use block 来调用工具
      tools: TOOLS,
      messages,
    });

    // 模型的回复必须原封不动地放回 messages——这是"记忆"的一部分
    const assistantContent = response.content;
    messages.push({ role: "assistant", content: assistantContent });

    for (const block of assistantContent) {
      if (block.type === "text") {
        console.log(`assistant> ${block.text}\n`);
      }
    }

    // ★ Agent 循环的核心判断 ★
    // stop_reason === "tool_use" → 模型想调用工具，循环继续
    // stop_reason === "end_turn" → 模型认为任务完成，循环退出
    if (response.stop_reason !== "tool_use") {
      break;
    }

    // 模型可能一次返回多个 tool_use block → 都要执行
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

    // ★ API 协议要求 ★
    // 工具结果必须作为 role: "user" 的 message 发回
    // 每个 tool_result 通过 tool_use_id 关联到对应的 tool_use block
    // 然后模型看到结果，决定下一步行动——这就是"循环"的驱动力
    messages.push({ role: "user", content: toolResults });
  }

  if (turnCount >= MAX_TURNS) {
    console.log("\n[system] 达到最大轮次限制，停止执行\n");
  }
}
