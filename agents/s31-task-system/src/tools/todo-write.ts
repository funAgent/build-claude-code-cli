/**
 * s27 — TodoWrite 工具
 *
 * 让 Agent 在执行复杂任务前先规划：拆解为结构化任务列表，
 * 逐项标记 in_progress / completed，保持执行的条理性。
 *
 * 对照 Claude Code: tools/TodoWriteTool/TodoWriteTool.ts
 * - 接收 todos 数组 + merge 标志
 * - 按 agentId 隔离存储
 * - allDone 时清空
 * - 生产版还有 verification nudge（全部完成后提示验证）
 */

import { buildTool } from "../tool.js";
import { updateTodos, formatTodos, type TodoItem } from "../todo.js";

export const todoWriteTool = buildTool({
  name: "todo_write",
  description:
    "创建或更新任务列表。用于规划复杂任务：先拆解为多个步骤，" +
    "然后逐步执行并更新状态。每个任务有 id、content 和 status。" +
    "status 可选值：pending（待做）、in_progress（进行中）、completed（已完成）。" +
    "同一时间建议只有一个任务处于 in_progress 状态。",
  inputSchema: {
    type: "object" as const,
    properties: {
      todos: {
        type: "array",
        description: "任务列表",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "任务唯一标识符",
            },
            content: {
              type: "string",
              description: "任务描述",
            },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed"],
              description: "任务状态",
            },
          },
          required: ["id", "content", "status"],
        },
        minItems: 1,
      },
      merge: {
        type: "boolean",
        description:
          "是否与现有任务合并（true=按 id 合并更新，false=完全替换）。默认 false。",
        default: false,
      },
    },
    required: ["todos"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input) {
    const todos = input.todos as TodoItem[];
    const merge = (input.merge as boolean) ?? false;

    // 验证 status
    const validStatuses = new Set(["pending", "in_progress", "completed"]);
    for (const todo of todos) {
      if (!validStatuses.has(todo.status)) {
        return {
          output: `错误: 无效的 status "${todo.status}"，有效值为 pending / in_progress / completed`,
          isError: true,
        };
      }
      if (!todo.id || !todo.content) {
        return {
          output: "错误: 每个任务必须有 id 和 content",
          isError: true,
        };
      }
    }

    const result = updateTodos(todos, { merge });

    if (result.length === 0) {
      return { output: "所有任务已完成，任务列表已清空。" };
    }

    const summary = formatTodos(result);
    const stats = {
      total: result.length,
      pending: result.filter((t) => t.status === "pending").length,
      inProgress: result.filter((t) => t.status === "in_progress").length,
      completed: result.filter((t) => t.status === "completed").length,
    };

    return {
      output: [
        `任务列表已更新 (${merge ? "合并" : "替换"}模式):`,
        "",
        summary,
        "",
        `统计: ${stats.total} 总计 | ${stats.completed} 完成 | ${stats.inProgress} 进行中 | ${stats.pending} 待做`,
      ].join("\n"),
    };
  },
});
