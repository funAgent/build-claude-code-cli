/**
 * s31 — Task 持久化存储
 *
 * Task System 是 TodoWrite 的升级版：
 * - 磁盘持久化（JSON 文件，而非内存 Map）
 * - 依赖图（blocks/blockedBy，任务间有先后关系）
 * - 多 Agent 协作（共享数据结构）
 *
 * 对照 Claude Code: utils/tasks.ts (~863 行)
 * - 存储: ~/.claude/.../tasks/<taskListId>/<id>.json
 * - ID: 单调递增数字 + high water mark 防止重用
 * - 并发: proper-lockfile 文件锁
 * - 依赖: blocks/blockedBy 双向边列表
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ── 类型定义 ─────────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "completed";

/**
 * 任务定义。
 * 对照 Claude Code: TaskSchema
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee?: string;        // agentId
  blocks: string[];          // 被此任务阻塞的任务 ID
  blockedBy: string[];       // 阻塞此任务的任务 ID
  createdAt: string;
  updatedAt: string;
}

// ── 存储管理 ─────────────────────────────────────────────────

// 任务存储目录
// 对照 Claude Code: getTasksDir() → ~/.claude/.../tasks/<taskListId>/
function getTasksDir(projectDir: string): string {
  return join(projectDir, ".agent-tasks");
}

function getTaskPath(projectDir: string, taskId: string): string {
  return join(getTasksDir(projectDir), `${taskId}.json`);
}

// 自增 ID 计数器（简化版，生产版用 high water mark 文件）
let nextId = 1;

function ensureTasksDir(projectDir: string): void {
  const dir = getTasksDir(projectDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── CRUD 操作 ────────────────────────────────────────────────

/**
 * 创建新任务。
 * 对照 Claude Code: createTask()
 */
export function createTask(
  projectDir: string,
  input: {
    title: string;
    description: string;
    blockedBy?: string[];
  },
): Task {
  ensureTasksDir(projectDir);

  const task: Task = {
    id: String(nextId++),
    title: input.title,
    description: input.description,
    status: "pending",
    blocks: [],
    blockedBy: input.blockedBy ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 更新被阻塞任务的 blocks 列表（双向边）
  // 对照 Claude Code: blockTask() 更新双向
  for (const depId of task.blockedBy) {
    const dep = getTask(projectDir, depId);
    if (dep && !dep.blocks.includes(task.id)) {
      dep.blocks.push(task.id);
      dep.updatedAt = new Date().toISOString();
      writeFileSync(getTaskPath(projectDir, depId), JSON.stringify(dep, null, 2));
    }
  }

  writeFileSync(getTaskPath(projectDir, task.id), JSON.stringify(task, null, 2));
  return task;
}

/**
 * 获取单个任务。
 * 对照 Claude Code: getTask()
 */
export function getTask(projectDir: string, taskId: string): Task | null {
  const path = getTaskPath(projectDir, taskId);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8"));
}

/**
 * 列出所有任务。
 * 对照 Claude Code: listTasks()
 */
export function listTasks(projectDir: string): Task[] {
  const dir = getTasksDir(projectDir);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => {
      try {
        return JSON.parse(readFileSync(join(dir, f), "utf-8")) as Task;
      } catch {
        return null;
      }
    })
    .filter((t): t is Task => t !== null)
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/**
 * 更新任务。
 * 对照 Claude Code: updateTask() (TaskUpdateTool)
 */
export function updateTask(
  projectDir: string,
  taskId: string,
  updates: Partial<Pick<Task, "title" | "description" | "status" | "assignee">>,
): Task | null {
  const task = getTask(projectDir, taskId);
  if (!task) return null;

  // 检查依赖约束：有未完成的 blockedBy 不能开始
  if (updates.status === "in_progress") {
    const unresolved = task.blockedBy.filter((depId) => {
      const dep = getTask(projectDir, depId);
      return dep && dep.status !== "completed";
    });
    if (unresolved.length > 0) {
      throw new Error(
        `任务 ${taskId} 被任务 ${unresolved.join(", ")} 阻塞，无法开始`,
      );
    }
  }

  Object.assign(task, updates, { updatedAt: new Date().toISOString() });
  writeFileSync(getTaskPath(projectDir, taskId), JSON.stringify(task, null, 2));
  return task;
}

/**
 * 格式化任务列表。
 */
export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) return "（无任务）";

  const icon: Record<TaskStatus, string> = {
    pending: "○",
    in_progress: "◉",
    completed: "✓",
  };

  return tasks
    .map((t) => {
      let line = `${icon[t.status]} #${t.id} [${t.status}] ${t.title}`;
      if (t.blockedBy.length > 0) {
        line += ` (blocked by: ${t.blockedBy.join(", ")})`;
      }
      if (t.assignee) {
        line += ` → ${t.assignee}`;
      }
      return line;
    })
    .join("\n");
}
