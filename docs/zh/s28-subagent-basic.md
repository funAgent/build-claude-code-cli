# s28 — Subagent 基础：上下文隔离

## 问题场景

用户说："分析这个项目的代码质量，同时生成 API 文档。"

如果主 Agent 串行处理，问题是：

```
串行执行的困境：

  主 Agent context:
  ├── 分析代码质量 (30 条消息、大量工具输出)
  │     └── context 膨胀到 ~150K tokens
  └── 开始生成 API 文档
        └── context 已经快满了！
            前面的代码分析细节占据了大量空间
```

**Break big tasks down; each subtask gets a clean context.**

## 设计决策

### 隔离什么，共享什么

```
子 Agent 的隔离边界：

  ┌─ 主 Agent ──────────────────────────┐
  │  agentId: "__main__"                 │
  │  messages: [完整对话历史]             │
  │  tools: [全部工具]                   │
  │  cwd: /project                       │──── 共享
  └──────────┬──────────────────────────┘     文件系统
             │ 创建子 Agent
             ↓
  ┌─ 子 Agent ─────────────────────────┐
  │  agentId: "agent_a1b2c3d4"          │ ← 独立身份
  │  messages: [只有任务描述]            │ ← 干净上下文
  │  tools: [工具子集]                   │ ← 可限制
  │  cwd: /project                       │──── 共享
  └────────────────────────────────────┘     文件系统

  隔离：对话历史（记忆）、agentId、todo 列表
  共享：文件系统（cwd）、工具能力
```

### Abort 控制策略

```
同步 vs 异步子 Agent 的 abort 策略：

  同步子 Agent（等待完成）:
  ┌──────────────────────────────┐
  │  父取消 → 子也取消           │
  │  共享 abortController        │
  └──────────────────────────────┘

  异步子 Agent（后台运行）:
  ┌──────────────────────────────┐
  │  父取消 → 子继续运行         │
  │  独立 abortController        │
  └──────────────────────────────┘
```

## 实现

### 创建子 Agent 上下文

```typescript
export function createSubagentContext(options: {
  parentAgentId: string;
  parentCwd: string;
  parentAbortController: AbortController;
  isAsync?: boolean;
  parentDepth?: number;
}): SubagentContext {
  const agentId = `agent_${randomUUID().slice(0, 8)}`;

  // 同步共享 abort，异步独立
  const abortController = options.isAsync
    ? new AbortController()
    : options.parentAbortController;

  return {
    agentId,
    parentAgentId: options.parentAgentId,
    cwd: options.parentCwd,
    abortController,
    depth: (options.parentDepth ?? 0) + 1,
  };
}
```

### AgentTool

```typescript
export const agentTool = buildTool({
  name: "agent",
  description: "启动子 Agent 完成独立子任务...",
  async call(input, context) {
    const subContext = createSubagentContext({
      parentAgentId: "__main__",
      parentCwd: context.cwd,
      parentAbortController: new AbortController(),
    });

    // 独立的消息历史——干净的上下文
    const messages = [{ role: "user", content: input.task }];

    // 子 Agent 运行自己的查询循环
    while (turns < SUBAGENT_MAX_TURNS) {
      const response = await client.messages.create({
        system: getSubagentSystemPrompt(input.task),
        messages,
      });
      // ... 工具执行 ...
      if (response.stop_reason !== "tool_use") break;
    }

    return { output: resultText };
  },
});
```

关键点：子 Agent 运行完整的 Agent Loop（while + tool_use），但有自己独立的 messages 数组。

## 运行验证

```bash
cd agents/s28-subagent-basic
npm run dev

> 分析 src/ 目录的代码质量，同时搜索所有 TODO 注释
# Agent 会创建子 Agent 来独立执行子任务
```

## 对照 Claude Code

| 维度 | 教学版 (s28) | Claude Code |
|------|-------------|-------------|
| agentId | `agent_` + 随机 UUID 片段 | `createAgentId()` from `utils/uuid.js` |
| Agent 类型 | 仅同步 | built-in / custom / async（不同的工具集和生命周期） |
| 工具池 | 与父 Agent 相同 | `resolveAgentTools()` — 按 agent 定义过滤 |
| 系统提示 | 简化的任务聚焦提示 | 完整系统提示 + agent 前言 + 技能预加载 |
| MCP | 无 | `initializeAgentMcpServers` 按 agent frontmatter 初始化 |
| 清理 | 无 | `finally` 块：MCP 清理、shell 进程 kill、todo 清理、readFileState 清理 |
| Abort | 同步共享 / 异步独立 | 同（`isAsync ? new AbortController() : toolUseContext.abortController`） |

## 深入思考

1. **上下文隔离的价值**：子 Agent 不继承 150K tokens 的历史，它只看到"搜索所有 TODO 注释"这一条消息。更少的上下文 = 更聚焦的执行 = 更好的结果。
2. **共享文件系统的风险**：子 Agent 可以修改文件，但父 Agent 不知道改了什么。Claude Code 通过文件快照和 readFileState 来跟踪子 Agent 的文件修改。
3. **生命周期管理**：子 Agent 结束后，它的 todo 列表、shell 进程、MCP 连接都应该被清理。`finally` 块是生命周期管理的关键。

## 练习

1. 让主 Agent 创建两个子 Agent 分别做不同的事，观察它们的独立上下文
2. 实现异步子 Agent：后台运行，主 Agent 继续对话
3. 添加子 Agent 的执行日志：记录每个子 Agent 的工具调用和结果
