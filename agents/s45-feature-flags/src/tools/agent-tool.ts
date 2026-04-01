/**
 * s29 — AgentTool（子 Agent 工具 — 进阶版）
 *
 * 在 s28 的基础上增加：
 * 1. 工具过滤: 子 Agent 不能用 agent 工具（防递归）
 * 2. 递归深度控制: 最多 3 层嵌套
 * 3. 生命周期清理: 子 Agent 结束后清理资源
 *
 * 对照 Claude Code: AgentTool + runAgent + agentToolUtils
 */

import Anthropic from "@anthropic-ai/sdk";
import { buildTool, toAnthropicTools } from "../tool.js";
import {
  createSubagentContext,
  getSubagentSystemPrompt,
} from "../subagent.js";
import { assembleToolPool } from "../tools.js";
import {
  filterToolsForAgent,
  canCreateSubagent,
  cleanupSubagent,
} from "../agent-utils.js";

const SUBAGENT_MAX_TURNS = 8;
const MODEL = "claude-sonnet-4-20250514";

export const agentTool = buildTool({
  name: "agent",
  description:
    "启动子 Agent 完成独立子任务。子 Agent 有独立的对话上下文，" +
    "但与主 Agent 共享文件系统。子 Agent 的工具集是父 Agent 的子集。" +
    "最大嵌套深度为 3 层。",
  inputSchema: {
    type: "object" as const,
    properties: {
      task: {
        type: "string",
        description: "子 Agent 需要完成的任务描述",
      },
      readOnly: {
        type: "boolean",
        description: "是否以只读模式运行（只允许读操作工具）",
        default: false,
      },
    },
    required: ["task"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    const task = input.task as string;
    const readOnly = (input.readOnly as boolean) ?? false;
    const currentDepth = 0; // 教学简化：从 context 获取

    // ── 深度检查 ─────────────────────────────
    const depthCheck = canCreateSubagent(currentDepth);
    if (!depthCheck.allowed) {
      return { output: depthCheck.reason!, isError: true };
    }

    const subContext = createSubagentContext({
      parentAgentId: "__main__",
      parentCwd: context.cwd,
      parentAbortController: new AbortController(),
      parentDepth: currentDepth,
    });

    // ── 工具过滤 ─────────────────────────────
    // 子 Agent 的工具集 ⊂ 父 Agent
    const fullRegistry = assembleToolPool();
    const filteredTools = filterToolsForAgent(fullRegistry.getAll(), {
      readOnly,
    });
    const toolMap = new Map(filteredTools.map((t) => [t.name, t]));
    const apiTools = toAnthropicTools(filteredTools);

    const client = new Anthropic();
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: task },
    ];

    let turns = 0;
    let resultText = "";

    try {
      while (turns < SUBAGENT_MAX_TURNS) {
        turns++;

        if (subContext.abortController.signal.aborted) {
          return { output: "子 Agent 被中止", isError: true };
        }

        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 8192,
          system: getSubagentSystemPrompt(task),
          tools: apiTools,
          messages,
        });

        messages.push({ role: "assistant", content: response.content });

        for (const block of response.content) {
          if (block.type === "text") resultText += block.text;
        }

        if (response.stop_reason !== "tool_use") break;

        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          const tool = toolMap.get(block.name);
          if (!tool) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `工具 ${block.name} 不可用（已被过滤）`,
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
    } finally {
      // ── 生命周期清理 ─────────────────────
      cleanupSubagent(subContext.agentId);
    }

    return {
      output: resultText || "(子 Agent 未返回文本结果)",
    };
  },
});
