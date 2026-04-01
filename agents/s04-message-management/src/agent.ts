/**
 * s04 — Agent with message management
 *
 * 在 s03 的基础上加入：
 * - 类型化的消息系统
 * - 消息格式化输出
 * - 工具输出截断
 * - 对话统计
 */

import Anthropic from "@anthropic-ai/sdk";
import { execShell } from "./tools/bash.js";
import {
  createUserMessage,
  createAssistantMessage,
  createToolResultMessage,
  getTextContent,
  hasToolUse,
  getToolUseBlocks,
  type AgentMessage,
} from "./types.js";
import {
  truncateContent,
  formatMessage,
  toApiMessages,
  getConversationStats,
} from "./messages.js";

const client = new Anthropic();

const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description:
      "Execute a shell command. Use this to explore files, run programs, install packages, etc.",
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
  "You are a helpful CLI assistant. You can execute shell commands using the bash tool. " +
  "When the user asks you to do something, break it down into steps and use tools as needed.";

const MAX_TURNS = 10;

export class Agent {
  private history: AgentMessage[] = [];

  async run(userInput: string): Promise<void> {
    const userMsg = createUserMessage(userInput);
    this.history.push(userMsg);
    console.log(formatMessage(userMsg));

    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: toApiMessages(this.history),
      });

      const assistantMsg = createAssistantMessage(
        response.content,
        response.usage
      );
      this.history.push(assistantMsg);

      const text = getTextContent(assistantMsg);
      if (text) console.log(`\nassistant> ${text}\n`);

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of getToolUseBlocks(assistantMsg)) {
        const name = "name" in block ? (block.name as string) : "unknown";
        const input = "input" in block ? block.input : {};
        const id = "id" in block ? (block.id as string) : "";

        console.log(`  [tool] ${name}(${JSON.stringify(input)})`);

        if (name === "bash") {
          const { command } = input as { command: string };
          const result = await execShell(command);

          let output = result.timedOut
            ? `[超时] 命令被终止\n${result.stdout}`
            : result.stderr
              ? `${result.stdout}\nstderr: ${result.stderr}\nexit: ${result.exitCode}`
              : result.stdout || "(no output)";

          output = truncateContent(output);

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

      const toolMsg = createToolResultMessage(toolResults);
      this.history.push(toolMsg);
    }

    if (turnCount >= MAX_TURNS) {
      console.log("\n[system] 达到最大轮次限制\n");
    }
  }

  showStats(): void {
    const stats = getConversationStats(this.history);
    console.log("\n--- 对话统计 ---");
    console.log(`总消息数: ${stats.totalMessages}`);
    console.log(`用户消息: ${stats.userMessages}`);
    console.log(`助手消息: ${stats.assistantMessages}`);
    console.log(`总输入 tokens: ${stats.totalInputTokens}`);
    console.log(`总输出 tokens: ${stats.totalOutputTokens}`);
    console.log(`历史长度: ${JSON.stringify(this.history).length} 字符`);
  }
}
