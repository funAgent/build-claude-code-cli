/**
 * s31 — TaskListTool
 *
 * 列出所有持久化任务。
 * 对照 Claude Code: tools/TaskListTool/TaskListTool.ts
 */

import { buildTool } from "../tool.js";
import { listTasks, formatTaskList } from "../task-store.js";

export const taskListTool = buildTool({
  name: "task_list",
  description: "列出所有持久化任务及其状态和依赖关系。",
  inputSchema: {
    type: "object" as const,
    properties: {
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "按状态过滤（可选）",
      },
    },
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    let tasks = listTasks(context.cwd);

    if (input.status) {
      tasks = tasks.filter((t) => t.status === input.status);
    }

    return {
      output: tasks.length === 0
        ? "无任务"
        : `共 ${tasks.length} 个任务:\n\n${formatTaskList(tasks)}`,
    };
  },
});
