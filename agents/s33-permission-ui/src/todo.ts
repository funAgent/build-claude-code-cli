/**
 * s27 — Todo 状态管理
 *
 * 为 Agent 提供结构化的任务规划能力。
 * Agent 在处理复杂请求前先拆解为 todo 列表，然后逐项执行。
 *
 * 状态机：pending → in_progress → completed
 * 存储：按 agentId 隔离（子 Agent 有独立的 todo 列表）
 *
 * 对照 Claude Code: utils/todo/types.ts + TodoWriteTool.ts
 * - TodoStatusSchema: pending | in_progress | completed
 * - 存储 key 为 agentId ?? sessionId（子 Agent 隔离）
 * - allDone 时清空列表
 */

// ── 类型定义 ─────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed";

/**
 * 单个任务项。
 * 对照 Claude Code: TodoItem (content, status, activeForm)
 * 教学版省略 activeForm（用于 UI 展示的表单状态）。
 */
export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}

// ── 存储 ─────────────────────────────────────────────────────

// 按 agentId 隔离的 todo 存储
// 对照 Claude Code: 用 context.agentId ?? getSessionId() 作为 key
const todoStore = new Map<string, TodoItem[]>();

// 默认 key（主 Agent）
const DEFAULT_KEY = "__main__";

/**
 * 获取指定 Agent 的 todo 列表。
 */
export function getTodos(agentId?: string): TodoItem[] {
  return todoStore.get(agentId ?? DEFAULT_KEY) ?? [];
}

/**
 * 更新 todo 列表。
 *
 * 支持两种模式：
 * - merge=true: 按 id 合并更新（只修改传入的项）
 * - merge=false: 完全替换
 *
 * 对照 Claude Code: TodoWriteTool.call()
 * - allDone (全部 completed) 时清空列表
 * - 存储使用 agentId 隔离
 */
export function updateTodos(
  todos: TodoItem[],
  options: { merge?: boolean; agentId?: string } = {},
): TodoItem[] {
  const key = options.agentId ?? DEFAULT_KEY;
  const merge = options.merge ?? false;

  let result: TodoItem[];

  if (merge) {
    const existing = todoStore.get(key) ?? [];
    const existingMap = new Map(existing.map((t) => [t.id, t]));

    for (const todo of todos) {
      existingMap.set(todo.id, todo);
    }
    result = Array.from(existingMap.values());
  } else {
    result = [...todos];
  }

  // 全部完成时清空列表
  // 对照 Claude Code: allDone → stored list = []
  const allDone = result.length > 0 && result.every((t) => t.status === "completed");
  if (allDone) {
    todoStore.delete(key);
    return [];
  }

  todoStore.set(key, result);
  return result;
}

/**
 * 清除指定 Agent 的 todo 列表（生命周期清理用）。
 */
export function clearTodos(agentId?: string): void {
  todoStore.delete(agentId ?? DEFAULT_KEY);
}

/**
 * 格式化 todo 列表为可读字符串。
 */
export function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) return "（无任务）";

  const statusIcon: Record<TodoStatus, string> = {
    pending: "○",
    in_progress: "◉",
    completed: "✓",
  };

  return todos
    .map((t) => `${statusIcon[t.status]} [${t.status}] ${t.content}`)
    .join("\n");
}
