/**
 * s31 — TaskUpdateTool
 *
 * 更新任务状态。自动检查依赖约束：
 * 有未完成的 blockedBy 任务时不能标记为 in_progress。
 * 对照 Claude Code: tools/TaskUpdateTool/TaskUpdateTool.ts
 */

import { buildTool } from "../tool.js";
import { updateTask } from "../task-store.js";

export const taskUpdateTool = buildTool({
  name: "task_update",
  description:
    "更新任务的状态、标题或描述。" +
    "依赖约束：被阻塞的任务在所有前置任务完成前不能开始。",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "任务 ID" },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed"],
        description: "新状态",
      },
      title: { type: "string", description: "新标题（可选）" },
      assignee: { type: "string", description: "指派给哪个 agentId（可选）" },
    },
    required: ["id"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    try {
      const updates: Record<string, unknown> = {};
      if (input.status) updates.status = input.status;
      if (input.title) updates.title = input.title;
      if (input.assignee) updates.assignee = input.assignee;

      const task = updateTask(context.cwd, input.id as string, updates);
      if (!task) {
        return { output: `任务 #${input.id} 不存在`, isError: true };
      }

      return {
        output: `任务 #${task.id} 已更新: [${task.status}] ${task.title}`,
      };
    } catch (err) {
      return { output: (err as Error).message, isError: true };
    }
  },
});
