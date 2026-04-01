/**
 * s12 — TaskTool: 简单的任务管理（预览 s27 的 TodoWrite）
 */
import { buildTool, type ToolResult } from "../tool.js";

const tasks: { id: number; text: string; done: boolean }[] = [];
let nextId = 1;

export const taskTool = buildTool({
  name: "task",
  description: "Manage a simple task list. Actions: add, list, done.",
  inputSchema: {
    type: "object" as const,
    properties: {
      action: { type: "string", enum: ["add", "list", "done"], description: "Action to perform" },
      text: { type: "string", description: "Task text (for add action)" },
      id: { type: "number", description: "Task ID (for done action)" },
    },
    required: ["action"],
  },
  async call(input): Promise<ToolResult> {
    const action = input.action as string;
    if (action === "add") {
      const text = input.text as string;
      if (!text) return { output: "text is required for add", isError: true };
      tasks.push({ id: nextId, text, done: false });
      return { output: `Added task #${nextId++}: ${text}` };
    }
    if (action === "list") {
      if (tasks.length === 0) return { output: "No tasks" };
      return { output: tasks.map((t) => `${t.done ? "✓" : "○"} #${t.id} ${t.text}`).join("\n") };
    }
    if (action === "done") {
      const id = input.id as number;
      const task = tasks.find((t) => t.id === id);
      if (!task) return { output: `Task #${id} not found`, isError: true };
      task.done = true;
      return { output: `Completed task #${id}: ${task.text}` };
    }
    return { output: `Unknown action: ${action}`, isError: true };
  },
});
