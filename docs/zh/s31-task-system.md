# s31 — Task System：持久化任务与依赖图

## 问题场景

TodoWrite（s27）有两个致命限制：

```
TodoWrite 的限制：

  限制 1: 内存存储
  ┌──────────────────────────────────────┐
  │  会话结束 → todo 列表消失            │
  │  无法跨会话恢复                      │
  │  崩溃 → 进度丢失                     │
  └──────────────────────────────────────┘

  限制 2: 无依赖关系
  ┌──────────────────────────────────────┐
  │  ○ 设计数据库 schema                 │
  │  ○ 实现 API 接口    ← 依赖 schema   │
  │  ○ 编写前端页面     ← 依赖 API      │
  │                                      │
  │  TodoWrite 不知道这些依赖            │
  │  Agent 可能在 schema 完成前就开始     │
  │  写 API 接口                         │
  └──────────────────────────────────────┘
```

## 设计决策

### TodoWrite vs Task System

```
两套系统的定位：

  TodoWrite (s27):               Task System (s31):
  ├── 内存存储                    ├── 磁盘持久化 (JSON)
  ├── 单 Agent 使用               ├── 多 Agent 协作
  ├── 简单列表（无依赖）          ├── 依赖图 (blocks/blockedBy)
  ├── 会话级生命周期              ├── 跨会话持久化
  └── 用于单次对话的规划          └── 用于大型项目的协调

  Claude Code 的选择：
  isEnabled() 返回 !isTodoV2Enabled()
  → 开启 Task System 时自动禁用 TodoWrite
```

### 依赖图

```
依赖关系（双向边）:

  Task #1: 设计 Schema          Task #2: 实现 API
  ┌─────────────────┐           ┌─────────────────┐
  │ blocks: ["2"]   │──阻塞──→│ blockedBy: ["1"] │
  └─────────────────┘           └─────────────────┘

  规则：
  • #1 完成前，#2 不能标记为 in_progress
  • createTask 自动建立双向边
  • updateTask 检查依赖约束
```

### 磁盘存储

```
存储结构:

  project/
  └── .agent-tasks/
      ├── 1.json    ← Task #1 完整 JSON
      ├── 2.json    ← Task #2 完整 JSON
      └── 3.json    ← Task #3 完整 JSON

  每个文件包含:
  {
    "id": "1",
    "title": "设计数据库 Schema",
    "status": "completed",
    "blocks": ["2"],
    "blockedBy": [],
    "createdAt": "...",
    "updatedAt": "..."
  }
```

## 实现

### Task Store

```typescript
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee?: string;
  blocks: string[];      // 被此任务阻塞的任务
  blockedBy: string[];   // 阻塞此任务的任务
}

export function createTask(projectDir, input): Task {
  const task = { ...input, id: String(nextId++) };

  // 建立双向边
  for (const depId of task.blockedBy) {
    const dep = getTask(projectDir, depId);
    if (dep) dep.blocks.push(task.id);
  }

  writeFileSync(getTaskPath(task.id), JSON.stringify(task));
  return task;
}

export function updateTask(projectDir, taskId, updates): Task {
  const task = getTask(projectDir, taskId);

  // 依赖约束：有未完成的前置任务不能开始
  if (updates.status === "in_progress") {
    const unresolved = task.blockedBy.filter(
      depId => getTask(depId).status !== "completed"
    );
    if (unresolved.length > 0) {
      throw new Error(`被任务 ${unresolved.join(",")} 阻塞`);
    }
  }

  Object.assign(task, updates);
  writeFileSync(getTaskPath(taskId), JSON.stringify(task));
  return task;
}
```

### 4 个 Task 工具

```typescript
// task_create: 创建任务 + 指定依赖
task_create({ title: "设计 Schema", description: "...", blockedBy: [] })

// task_update: 更新状态（自动检查依赖约束）
task_update({ id: "1", status: "completed" })

// task_list: 列出所有任务
task_list({ status: "pending" })

// task_get: 获取详情
task_get({ id: "1" })
```

## 验证

```bash
cd agents/s31-task-system
npx tsx src/cli.tsx

> 我要重构整个项目架构，帮我规划任务
# Agent 会使用 task_create 创建有依赖关系的任务图
# 然后按依赖顺序逐项执行
```

## 对照 Claude Code

| 维度 | 教学版 (s31) | Claude Code |
|------|-------------|-------------|
| 存储格式 | 简单 JSON 文件 | JSON + proper-lockfile 文件锁 |
| ID 生成 | 自增计数器 | 单调递增 + high water mark 防重用 |
| 依赖图 | blocks/blockedBy 双向边 | 同 + 拓扑排序验证无环 |
| 并发安全 | 无 | proper-lockfile（多 Agent 同时操作） |
| 工具集 | create/update/list/get | 同 + TaskOutput（报告子任务结果） |
| 与 TodoWrite 关系 | 共存 | `isEnabled()` 互斥开关 |
| 事件通知 | 无 | 状态变更触发事件（UI 更新） |

## 深入思考

1. **持久化的价值**：Agent 崩溃、用户关闭终端、会话超时——这些都不应该丢失进度。磁盘存储让任务状态在任何场景下都可恢复。
2. **依赖图防止乱序**：没有依赖约束，Agent 可能跳过前置步骤直接开始后续工作。`blockedBy` 检查在代码层面强制执行顺序。
3. **多 Agent 协作**：当主 Agent 创建多个子 Agent 时，它们通过共享的 Task Store 协调工作。子 Agent A 完成任务后，子 Agent B 才能开始依赖的任务。

## 练习

1. 实现环检测：创建任务时验证不会形成循环依赖
2. 添加 proper-lockfile：防止多个 Agent 同时修改同一个任务文件
3. 实现 TaskOutputTool：子 Agent 完成任务后报告结果给父 Agent
