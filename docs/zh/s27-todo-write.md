# s27 — TodoWrite：让 Agent 先规划再执行

## 问题场景

用户说："帮我重构整个 auth 模块，包括 OAuth、JWT、权限检查、中间件。"

没有规划的 Agent 会怎么做？

```
无规划 Agent 的执行路径：

  用户请求 → "好的，我开始重构"
       ↓
  修改 auth.ts → 发现需要改 middleware.ts
       ↓
  修改 middleware.ts → 发现忘了改 jwt.ts
       ↓
  修改 jwt.ts → 改到一半发现 auth.ts 的改法有问题
       ↓
  回头改 auth.ts → 又影响了 middleware.ts...
       ↓
  混乱 → 遗漏 → 用户不满意
```

**一个没有计划的 Agent 会漂移。** 它不知道自己做了什么、该做什么、还剩什么。

## 设计决策

### TodoWrite 的定位

```
TodoWrite 在 Agent 工作流中的位置：

  用户请求（复杂任务）
       ↓
  ┌─ Agent 思考 ────────────────────────┐
  │  "这个任务有多个步骤，我先规划..."  │
  └──────────┬──────────────────────────┘
             ↓
  ┌─ TodoWrite（创建计划）──────────────┐
  │  ○ [pending]     分析 OAuth 逻辑    │
  │  ○ [pending]     重构 JWT 模块      │
  │  ○ [pending]     更新权限检查       │
  │  ○ [pending]     重写中间件         │
  └──────────┬──────────────────────────┘
             ↓
  ┌─ 逐项执行 ─────────────────────────┐
  │  ◉ [in_progress] 分析 OAuth 逻辑   │ ← 当前
  │  ○ [pending]     重构 JWT 模块      │
  │  ○ [pending]     更新权限检查       │
  │  ○ [pending]     重写中间件         │
  └──────────┬──────────────────────────┘
             ↓
  ┌─ 完成一项，更新状态 ───────────────┐
  │  ✓ [completed]   分析 OAuth 逻辑   │
  │  ◉ [in_progress] 重构 JWT 模块     │ ← 下一项
  │  ○ [pending]     更新权限检查       │
  │  ○ [pending]     重写中间件         │
  └────────────────────────────────────┘
```

### 状态机

```
TodoItem 状态流转：

  pending ──→ in_progress ──→ completed
    ○              ◉              ✓

  规则：
  • 同一时间建议只有一个 in_progress
  • 全部 completed 时自动清空列表
  • 不支持 cancelled（简化版）
```

### 按 agentId 隔离

```
Todo 存储隔离：

  主 Agent (key: "__main__")
  ┌──────────────────────────┐
  │  ○ 重构 auth 模块        │
  │  ◉ 更新 JWT              │
  └──────────────────────────┘

  子 Agent A (key: "agent_abc")
  ┌──────────────────────────┐
  │  ○ 分析文件依赖          │
  │  ○ 生成测试用例          │
  └──────────────────────────┘

  → 互不干扰，生命周期独立
```

## 实现

### Todo 数据结构

```typescript
export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  content: string;
  status: TodoStatus;
}
```

### 更新逻辑

```typescript
export function updateTodos(
  todos: TodoItem[],
  options: { merge?: boolean; agentId?: string } = {},
): TodoItem[] {
  const key = options.agentId ?? DEFAULT_KEY;

  let result: TodoItem[];
  if (options.merge) {
    // 按 id 合并：只更新传入的项
    const existing = todoStore.get(key) ?? [];
    const map = new Map(existing.map(t => [t.id, t]));
    for (const todo of todos) map.set(todo.id, todo);
    result = Array.from(map.values());
  } else {
    result = [...todos];
  }

  // 全部完成 → 清空
  if (result.every(t => t.status === "completed")) {
    todoStore.delete(key);
    return [];
  }

  todoStore.set(key, result);
  return result;
}
```

关键：`merge=true` 时只更新传入的 id，保留其他项不变。Agent 可以只传 `[{id: "step1", status: "completed"}]` 来标记完成。

### TodoWrite 工具

```typescript
export const todoWriteTool = buildTool({
  name: "todo_write",
  description: "创建或更新任务列表...",
  inputSchema: {
    type: "object",
    properties: {
      todos: { type: "array", items: { ... }, minItems: 1 },
      merge: { type: "boolean", default: false },
    },
    required: ["todos"],
  },
  isReadOnly: true,      // 不修改文件系统
  isConcurrencySafe: true, // 可并行调用
  async call(input) {
    const result = updateTodos(input.todos, { merge: input.merge });
    return { output: formatTodos(result) };
  },
});
```

## 验证

```bash
cd agents/s27-todo-write
npx tsx src/cli.tsx

# Agent 会在处理复杂任务时自动使用 TodoWrite
# 观察任务状态从 pending → in_progress → completed 的流转
```

## 对照 Claude Code

| 维度 | 教学版 (s27) | Claude Code |
|------|-------------|-------------|
| 状态值 | pending / in_progress / completed | 同（TodoStatusSchema） |
| 存储隔离 | 按 agentId（内存 Map） | 按 `context.agentId ?? getSessionId()`（内存） |
| 清空策略 | allDone → 清空 | 同（`todos.every(t => t.status === 'completed')` → `[]`） |
| 验证提示 | 无 | verification nudge（全部完成后建议生成验证子 Agent） |
| 与 Task 关系 | 无 | `isEnabled()` 返回 `!isTodoV2Enabled()`（Task 开启时禁用 TodoWrite） |
| UI 渲染 | 文本输出 | Ink 组件渲染 todo 列表 + 进度条 |

**Claude Code 的 TodoWrite 定位**：

```
TodoWrite vs Task System:

  TodoWrite (v1):
  ├── 内存存储，会话级生命周期
  ├── 单 Agent 使用
  ├── 简单列表，无依赖关系
  └── 用于单次对话中的任务规划

  Task System (v2):
  ├── 磁盘持久化 (JSON 文件)
  ├── 多 Agent 协作（共享数据结构）
  ├── 依赖图 (blocks/blockedBy)
  └── 用于长期运行的复杂任务
```

## 深入思考

1. **规划的价值**：有规划的 Agent 完成率翻倍。TodoWrite 不是可选工具——它是 Agent 执行复杂任务的核心能力。模型通过维护一个可见的任务列表来约束自己的执行路径。
2. **merge 模式**：Agent 不需要每次传完整列表。`merge=true` 让它只传需要更新的项，减少 token 消耗。
3. **allDone 清空**：这是一个优雅的设计——任务全部完成后自动清理，不在 context 中留残余。

## 练习

1. 给 Agent 一个复杂任务（如"创建一个带认证的 REST API"），观察它如何拆解为 todo 列表
2. 实现 `cancelled` 状态：允许 Agent 取消不再需要的任务
3. 添加 todo 持久化：把任务列表写入 `.agent-todos.json`，支持会话恢复
