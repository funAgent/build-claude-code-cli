/**
 * s31 — TaskGetTool
 *
 * 获取单个任务的详细信息。
 * 对照 Claude Code: tools/TaskGetTool/TaskGetTool.ts
 */

import { buildTool } from "../tool.js";
import { getTask } from "../task-store.js";

export const taskGetTool = buildTool({
  name: "task_get",
  description: "获取指定任务的详细信息，包括描述、依赖关系和状态。",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: { type: "string", description: "任务 ID" },
    },
    required: ["id"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    const task = getTask(context.cwd, input.id as string);
    if (!task) {
      return { output: `任务 #${input.id} 不存在`, isError: true };
    }

    const details = [
      `任务 #${task.id}: ${task.title}`,
      `状态: ${task.status}`,
      `描述: ${task.description}`,
      task.assignee ? `指派: ${task.assignee}` : null,
      task.blockedBy.length > 0
        ? `被阻塞: ${task.blockedBy.join(", ")}`
        : null,
      task.blocks.length > 0
        ? `阻塞: ${task.blocks.join(", ")}`
        : null,
      `创建时间: ${task.createdAt}`,
      `更新时间: ${task.updatedAt}`,
    ].filter(Boolean);

    return { output: details.join("\n") };
  },
});
