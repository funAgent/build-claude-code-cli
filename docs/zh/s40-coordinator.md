# s40 — Coordinator：Leader-Worker 编排

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
