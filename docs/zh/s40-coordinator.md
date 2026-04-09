# s40 — Coordinator：Leader-Worker 编排

> **One coordinator, many workers — divide and conquer.**

`[ Phase 10: 多 Agent ]` · 工具数: 4 · 代码量: ~100 行

---

## 前置知识

- 需要完成: s39 Agent 定义：声明式配置

## 你将学到

- <abbr data-tip="将完整工具集拆分为不同角色使用的子集——编排者只能调度，执行者只能操作文件，实现关注点分离">工具池分裂</abbr>：Coordinator 只有编排工具，Worker 只有执行工具
- 系统提示策略：明确角色定义、Worker 能力描述、编排规则
- 并行任务调度：先分析再派活，<abbr data-tip="包含所有必要上下文信息的提示词，Worker 不依赖外部状态即可独立完成任务，类似无状态的 REST 请求">自包含 prompt</abbr> 设计
- 安全隔离：Worker 不能创建子 Worker，防止递归爆炸

## 问题场景

一个复杂任务需要同时修改 5 个文件、运行测试、更新文档。单个 Agent 串行执行太慢。

```
串行 vs 并行：

  串行（单 Agent）：
  修改 A → 修改 B → 修改 C → 测试 → 文档
  总时间: 5T

  并行（Coordinator）：
  Coordinator 分配任务:
  ├── Worker 1: 修改 A    ─┐
  ├── Worker 2: 修改 B    ─┤ 并行执行
  ├── Worker 3: 修改 C    ─┤
  └── Worker 4: 测试+文档  ─┘
  总时间: ~T (加通信开销)
```

**One coordinator, many workers — divide and conquer.**

## 设计决策

### 工具池分裂

```
严格的工具隔离：

  Coordinator（编排层）        Worker（执行层）
  ┌────────────────────┐      ┌─────────────────┐
  │ agent              │      │ bash             │
  │ send_message       │      │ file_read        │
  │ task_stop          │      │ file_write       │
  │                    │      │ file_edit        │
  │ ✗ bash             │      │ glob, grep, ls   │
  │ ✗ file_read        │      │ skill            │
  │ ✗ file_write       │      │                  │
  └────────────────────┘      │ ✗ agent          │
                              │ ✗ send_message   │
                              └─────────────────┘

  Coordinator 不能直接执行 → 必须通过 Worker
  Worker 不能创建子 Worker → 防止递归爆炸
```

### 系统提示策略

```
Coordinator 提示词的关键：

  1. 明确角色: "你是协调者，不直接执行"
  2. 描述 Worker 能力: "Worker 可以使用: bash, file_read..."
  3. 编排规则:
     - 并行优先
     - 自包含 prompt（Worker 不知道上下文）
     - 先分析再派活
     - 汇总结果
```

## 实现

### Coordinator 系统提示

```typescript
export function getCoordinatorSystemPrompt(): string {
  return `你是一个任务协调者。你只能使用编排工具：
- agent: 创建 Worker
- send_message: 给 Worker 发消息
- task_stop: 停止 Worker

不要直接执行，所有工作由 Worker 完成。并行优先。`;
}
```

### 工具池过滤

```typescript
export function filterCoordinatorTools(allTools) {
  return allTools.filter(t => COORDINATOR_TOOLS.includes(t.name));
}

export function filterWorkerTools(allTools) {
  return allTools.filter(t => WORKER_ALLOWED_TOOLS.includes(t.name));
}
```

## 运行验证

```bash
cd agents/s40-coordinator
npm run dev

# 1. 提交一个需要并行处理的任务
#    > 帮我同时重构 auth.ts、db.ts 和 api.ts

# 2. 观察 Coordinator 分配任务
#    → [coordinator] Dispatching 3 workers...
#    → Worker-1: 处理 auth.ts
#    → Worker-2: 处理 db.ts
#    → Worker-3: 处理 api.ts

# 3. 验证工具池隔离
#    → Coordinator 只有 agent、send_message 等编排工具
#    → Worker 有 file_read、file_write 等执行工具，但无 agent 工具
```

## 对照 Claude Code

| 维度 | 教学版 (s40) | Claude Code |
|------|-------------|-------------|
| 切换 | 环境变量 | feature flag + CLAUDE_CODE_COORDINATOR |
| 提示词 | 固定文本 | 动态 + MCP 工具列表 + scratchpad |
| 工具过滤 | 两个常量数组 | applyCoordinatorToolFilter + 工具池合并 |
| Worker 描述 | 静态列表 | getCoordinatorUserContext 动态生成 |
| 会话恢复 | 无 | matchSessionMode 自动切换 |

## 深入思考

1. **工具隔离是安全保证**：Coordinator 不能直接执行是刻意设计——它只能通过 Worker 间接操作，这限制了单点故障的影响范围。
2. **Prompt 是文档不是代码**：Coordinator 告诉 Worker 能用什么工具是通过自然语言描述，不是代码约束。但运行时有真正的工具过滤作为硬约束。
3. **并行是 Coordinator 的核心价值**：如果所有任务都串行，用 Coordinator 反而增加了通信开销。只有并行才能体现价值。

## 练习

1. 实现 Coordinator 模式的切换和会话恢复
2. 添加 Worker 能力的动态描述（根据已连接的 MCP 服务器）
3. 实现任务进度追踪：Coordinator 知道每个 Worker 的状态

<details>
<summary>练习 3 参考实现</summary>

Coordinator 端的任务进度追踪：

```typescript
interface WorkerStatus {
  agentId: string;
  status: "idle" | "running" | "completed" | "failed";
  task: string;
  startedAt: number;
  completedAt?: number;
}

class CoordinatorTracker {
  private workers = new Map<string, WorkerStatus>();

  assignTask(agentId: string, task: string) {
    this.workers.set(agentId, {
      agentId, status: "running", task, startedAt: Date.now(),
    });
  }

  completeTask(agentId: string, success: boolean) {
    const w = this.workers.get(agentId);
    if (w) {
      w.status = success ? "completed" : "failed";
      w.completedAt = Date.now();
    }
  }

  getProgress(): { total: number; completed: number; running: number } {
    const all = [...this.workers.values()];
    return {
      total: all.length,
      completed: all.filter(w => w.status === "completed").length,
      running: all.filter(w => w.status === "running").length,
    };
  }
}
```

Coordinator 在每轮循环中调用 `getProgress()`，实时展示 `[2/5 completed, 3 running]` 进度条。

</details>

## 下一课预告

**s41 — Team + Mailbox**：多个 Agent 之间的通信机制——文件邮箱、JSON 消息队列、零依赖 IPC。
