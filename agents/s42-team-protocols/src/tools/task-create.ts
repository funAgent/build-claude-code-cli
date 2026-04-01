/**
 * s31 — TaskCreateTool
 *
 * 创建新任务，支持指定依赖关系。
 * 对照 Claude Code: tools/TaskCreateTool/TaskCreateTool.ts
 */

import { buildTool } from "../tool.js";
import { createTask } from "../task-store.js";

export const taskCreateTool = buildTool({
  name: "task_create",
  description:
    "创建一个持久化任务。支持指定依赖关系（blockedBy）。" +
    "任务会保存到磁盘，支持跨会话和多 Agent 协作。",
  inputSchema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "任务标题" },
      description: { type: "string", description: "任务详细描述" },
      blockedBy: {
        type: "array",
        items: { type: "string" },
        description: "被阻塞的任务 ID 列表（这些任务完成后才能开始本任务）",
      },
    },
    required: ["title", "description"],
  },
  isReadOnly: false,
  isConcurrencySafe: false,
  async call(input, context) {
    const task = createTask(context.cwd, {
      title: input.title as string,
      description: input.description as string,
      blockedBy: (input.blockedBy as string[]) ?? [],
    });

    return {
      output: [
        `已创建任务 #${task.id}: ${task.title}`,
        task.blockedBy.length > 0
          ? `  依赖: ${task.blockedBy.join(", ")}`
          : "",
        `  状态: ${task.status}`,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  },
});
