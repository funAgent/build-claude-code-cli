# s29 — Subagent 进阶：工具限制与深度控制

## 问题场景

s28 的子 Agent 有完整的工具集——包括 `agent` 工具本身。这意味着：

```
无限递归风险：

  主 Agent → agent("做任务 A")
    └── 子 Agent A → agent("做子任务 B")
        └── 子 Agent B → agent("做子任务 C")
            └── 子 Agent C → agent("做子任务 D")
                └── ... 无限创建下去
                    → 资源耗尽 + API 成本失控
```

**A subagent should do less, not more.** 子 Agent 的能力必须小于父 Agent。

## 设计决策

### 工具过滤策略

```
工具过滤层级：

  父 Agent 工具集:
  ┌──────────────────────────────────────┐
  │ glob  grep  ls  file_read  bash     │
  │ file_write  file_edit  todo_write   │
  │ help  agent                          │
  └──────────────┬───────────────────────┘
                 │ filterToolsForAgent()
                 ↓
  子 Agent 工具集 (标准):
  ┌──────────────────────────────────────┐
  │ glob  grep  ls  file_read  bash     │
  │ file_write  file_edit  todo_write   │
  │ ✗ help  ✗ agent ← 已移除            │
  └──────────────────────────────────────┘

  子 Agent 工具集 (只读):
  ┌──────────────────────────────────────┐
  │ glob  grep  ls  file_read           │
  │ todo_write                           │
  │ ✗ 所有写操作工具 ← 已移除            │
  └──────────────────────────────────────┘
```

### 递归深度控制

```
深度限制（MAX_DEPTH = 3）:

  depth=0: 主 Agent        ← 全部工具
  depth=1: 子 Agent A      ← 过滤后工具（无 agent）
  depth=2: 子 Agent B      ← 理论上可以（如果 A 有 agent）
  depth=3: ✗ 拒绝创建      ← canCreateSubagent() 返回 false

  教学版简化: 子 Agent 没有 agent 工具，
  所以实际上 depth 最多到 1。
  生产版通过 queryTracking.depth 追踪。
```

### 生命周期清理

```
子 Agent 结束时的清理工作（finally 块）:

  try {
    // 子 Agent 运行 Agent Loop
  } finally {
    cleanupSubagent(agentId):
      ├── clearTodos(agentId)     ← 清理 todo 列表
      ├── killShellTasks(...)     ← 杀死遗留 shell 进程
      ├── killMcpTasks(...)       ← 关闭 MCP 连接
      └── readFileState.clear()   ← 清理文件状态
  }
```

## 实现

### 工具过滤

```typescript
const DISALLOWED_TOOLS = new Set([
  "agent",  // 防止递归
  "help",   // 子 Agent 不需要
]);

export function filterToolsForAgent(
  tools: Tool[],
  options: { readOnly?: boolean } = {},
): Tool[] {
  return tools.filter(tool => {
    if (DISALLOWED_TOOLS.has(tool.name)) return false;
    if (options.readOnly) return READONLY_TOOLS.has(tool.name);
    return true;
  });
}
```

### 深度检查

```typescript
const MAX_DEPTH = 3;

export function canCreateSubagent(currentDepth: number) {
  if (currentDepth >= MAX_DEPTH) {
    return { allowed: false, reason: "已达最大递归深度" };
  }
  return { allowed: true };
}
```

### AgentTool 集成

```typescript
async call(input, context) {
  // 1. 深度检查
  const depthCheck = canCreateSubagent(currentDepth);
  if (!depthCheck.allowed) return { output: depthCheck.reason, isError: true };

  // 2. 工具过滤
  const filteredTools = filterToolsForAgent(allTools, { readOnly });

  // 3. 运行子 Agent
  try {
    while (turns < MAX_TURNS) { ... }
  } finally {
    // 4. 生命周期清理（即使出错也执行）
    cleanupSubagent(subContext.agentId);
  }
}
```

## 验证

```bash
cd agents/s29-subagent-advanced
npx tsx src/cli.tsx

> 用只读子 Agent 分析 src/ 目录结构
# 子 Agent 只有读操作工具，不能修改文件
```

## 对照 Claude Code

| 维度 | 教学版 (s29) | Claude Code |
|------|-------------|-------------|
| 禁止工具 | `agent` + `help` | `ALL_AGENT_DISALLOWED_TOOLS`：TaskOutput、plan 工具、AskUserQuestion 等 |
| 异步白名单 | 无 | `ASYNC_AGENT_ALLOWED_TOOLS`：读/搜索/编辑/shell/TodoWrite 等 |
| 深度追踪 | 简单计数 | `queryTracking.depth`（AsyncLocalStorage 跨调用链传递） |
| 递归防护 | `canCreateSubagent()` 检查深度 | fork 路径：检查 `querySource` + `isInForkChild()` |
| 生命周期 | `clearTodos()` | MCP 清理 + shell kill + todo 清理 + readFileState |
| 工具解析 | 简单过滤 | `resolveAgentTools()` — 支持通配符、per-agent disallowedTools、allowedAgentTypes |

## 深入思考

1. **最小权限原则**：子 Agent 应该只拥有完成任务所需的最少工具。`readOnly` 模式让分析类子任务更安全。
2. **递归是危险的**：没有深度限制的 Agent 递归可能导致 API 成本指数增长。每层子 Agent 都有自己的对话历史和 API 调用。
3. **finally 的重要性**：子 Agent 可能因为 abort、错误或超时而提前退出。`finally` 确保资源总是被清理，防止内存泄漏和进程残留。

## 练习

1. 在 `DISALLOWED_TOOLS` 中添加 `bash`，创建一个"安全沙箱"模式的子 Agent
2. 实现 `AsyncLocalStorage` 版的深度追踪，让深度信息自动在调用链中传递
3. 添加子 Agent 的执行时间限制：超过 30 秒自动中止
