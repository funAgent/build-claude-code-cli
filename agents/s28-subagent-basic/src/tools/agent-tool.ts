/**
 * s28 — AgentTool（子 Agent 工具）
 *
 * 让主 Agent 能创建子 Agent 来处理独立子任务。
 * 子 Agent 有独立的对话历史但共享文件系统。
 *
 * 对照 Claude Code: tools/AgentTool/ + runAgent.ts
 * 生产版支持 forked agent（复用 prompt cache）、
 * agent types（built-in / custom / async）、
 * MCP 初始化、技能预加载等。
 * 教学版聚焦核心：创建独立上下文 → 运行子查询循环 → 返回结果。
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildTool, type Tool, type ToolContext } from "../tool.js";
import { createSubagentContext, getSubagentSystemPrompt } from "../subagent.js";
import { assembleToolPool } from "../tools.js";

// 子 Agent 的最大轮次（比主 Agent 少，防止失控）
const SUBAGENT_MAX_TURNS = 8;
const MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

export const agentTool = buildTool({
  name: "agent",
  description:
    "启动一个子 Agent 来独立完成一个子任务。子 Agent 有独立的对话上下文，" +
    "但与主 Agent 共享文件系统。适合将大任务分解为独立的子任务并行或串行执行。" +
    "子 Agent 完成后会返回执行结果。",
  inputSchema: {
    type: "object" as const,
    properties: {
      task: {
        type: "string",
        description: "子 Agent 需要完成的任务描述",
      },
    },
    required: ["task"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    const task = input.task as string;

    // 创建隔离的子 Agent 上下文
    const subContext = createSubagentContext({
      parentAgentId: "__main__",
      parentCwd: context.cwd,
      parentAbortController: new AbortController(),
      parentDepth: 0,
    });

    // 子 Agent 使用独立的工具池（与父 Agent 相同）
    const registry = assembleToolPool();
    const client = new Anthropic();

    // 子 Agent 独立的消息历史
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: task },
    ];

    let turns = 0;
    let resultText = "";

    while (turns < SUBAGENT_MAX_TURNS) {
      turns++;

      if (subContext.abortController.signal.aborted) {
        return { output: "子 Agent 被中止", isError: true };
      }

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: getSubagentSystemPrompt(task),
        tools: registry.toApiTools(),
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      // 提取文本输出
      for (const block of response.content) {
        if (block.type === "text") {
          resultText += block.text;
        }
      }

      if (response.stop_reason !== "tool_use") break;

      // 执行工具调用
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        const tool = registry.get(block.name);
        if (!tool) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `工具 ${block.name} 不存在`,
            is_error: true,
          });
          continue;
        }

        const result = await tool.call(
          block.input as Record<string, unknown>,
          context,
        );

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result.output,
          ...(result.isError ? { is_error: true } : {}),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return {
      output: resultText || "(子 Agent 未返回文本结果)",
    };
  },
});
