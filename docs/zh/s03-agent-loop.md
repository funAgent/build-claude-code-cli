# s03 — Agent Loop

> **One loop is all you need**

`[ Phase 1: 最小 Agent ]` · 工具数: 1 · 代码量: ~100 行

---

## 前置知识

- 需要完成: s00 [AI API 入门] + s02 [子进程与安全执行]

## 你将学到

- AI Agent 的核心本质——一个 while 循环
- 模型如何通过 `tool_use` 请求执行工具
- 如何将工具结果作为 `tool_result` 送回模型
- 循环退出的判断条件
- 为什么这个循环能让 AI "自主行动"

## 问题场景

到 s02 为止，你有了两个独立的能力：
- s00: 能调用 AI 模型，得到文本回答
- s02: 能安全地执行 shell 命令

但这两个能力是割裂的。用户必须手动把命令结果复制给 AI，再把 AI 的建议手动执行。

一个真正的 AI Agent，应该能**自动决定**何时使用工具、**自动执行**工具、**自动理解**执行结果并继续推理。

这堂课，我们用一个 while 循环把这两个能力连起来。这个循环，就是 AI Agent 的全部秘密。

## 设计决策

### 循环条件：stop_reason vs content 检测

| 方案 | 优点 | 缺点 |
|------|------|------|
| `while(stop_reason === "tool_use")` | 直观，API 设计的本意 | Claude Code 发现它偶尔不可靠 |
| `while(true)` + 检测 content 中的 tool_use block | 100% 可靠 | 代码稍复杂 |

**教学版选择 stop_reason**，因为它最好理解。Claude Code 生产版选择了 content 检测，因为在万级用户量下，任何不可靠都会被放大。

### 最大轮次限制

Agent 循环必须有一个安全阀：

| 策略 | 优点 | 缺点 |
|------|------|------|
| 无限制 | 简单 | AI 可能死循环，烧掉大量 token |
| 固定上限 (MAX_TURNS=10) | 安全 | 可能在复杂任务中过早停止 |
| Token 预算 | 精确控制成本 | 实现复杂 |

我们用固定上限 10 轮。Claude Code 使用 token 预算（s07 课会实现），但 10 轮对入门足够了。

## 动手实现

### 步骤 1: 定义工具（Tool Definition）

告诉模型有哪些工具可用。每个工具是一个 JSON Schema：

```typescript
const TOOLS: Anthropic.Tool[] = [
  {
    name: "bash",
    description: "Execute a shell command...",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command to execute" },
      },
      required: ["command"],
    },
  },
];
```

> 完整的工具定义和 system prompt 见 **Code** 标签页

### 步骤 2: 核心循环

这是整课的核心——4 步循环：

```typescript
while (turnCount < MAX_TURNS) {
  // 1. 发送 messages 给模型（带工具定义）
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    tools: TOOLS,
    messages,
  });

  // 2. 把模型回复加入 messages
  messages.push({ role: "assistant", content: response.content });

  // 3. 检查是否需要执行工具
  if (response.stop_reason !== "tool_use") break;

  // 4. 执行工具，把结果作为 user message 送回
  const toolResults = await executeTools(response.content);
  messages.push({ role: "user", content: toolResults });
}
```

整个 Agent 就是这 4 步的无限循环。模型通过 `stop_reason: "tool_use"` 告诉你"我需要用工具"；当它觉得任务完成了，就返回 `stop_reason: "end_turn"`，循环自然结束。

### 步骤 3: 工具执行与结果格式

每个 `tool_use` block 都必须有对应的 `tool_result`——这是 API 的强制约定：

```typescript
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,   // 必须匹配 tool_use 的 id
  content: output,
  ...(exitCode !== 0 ? { is_error: true } : {}),
});
```

关键细节：`is_error: true` 不会导致 Agent 崩溃。相反，模型会看到错误，尝试修正或换一种方式。这就是 Agent 的"自我修正"能力。

> 完整实现见 **Code** 标签页的 `agent.ts`

## 运行验证

```bash
npm run dev "帮我看看当前目录有什么文件"
npm run dev   # 进入交互模式
```

> 点击 **Simulate** 标签页查看 Agent 循环的完整动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| 循环方式 | `stop_reason !== "tool_use"` | `while(true)` + content 检测 |
| 工具注册 | 硬编码数组 | `assembleToolPool()` 动态注册 |
| 工具执行 | 串行 for 循环 | StreamingToolExecutor 并行 |
| 轮次限制 | MAX_TURNS=10 | token 预算 + maxTurns |
| 错误处理 | 传 is_error | 分级恢复策略栈 |

> 更详细的架构对照见 **Deep Dive** 标签页

## 深入思考

**Q: 为什么 tool_result 必须作为 user message 发送？**

A: Anthropic Messages API 要求严格的 user/assistant 交替。模型的回复是 assistant message（包含 tool_use），所以工具结果必须包装成 user message（包含 tool_result）。这不是实现细节，而是 API 协议。

**Q: 如果模型一直请求使用工具，永远不停呢？**

A: 这就是 MAX_TURNS 存在的原因。没有这个安全阀，一个出错的 prompt 可能让 Agent 无限循环，消耗大量 token 和计算资源。Claude Code 用了更精细的方式：token 预算（到了上限自动压缩上下文继续，而不是直接停止）。

**Q: 模型怎么知道有哪些工具可用？**

A: 你在 API 调用中传入的 `tools` 数组会被注入到模型的上下文中。模型根据工具描述决定何时使用、使用哪个、传什么参数。所以**工具描述的质量直接决定了 Agent 的智能程度**。

## 动手练习

1. 修改 `runAgent`，在每轮循环开始时打印当前 `messages` 数组的长度，观察它如何增长
2. 给 Agent 添加第二个工具 `read_file`（读取文件内容），让模型能在 bash 和 read_file 之间选择
3. 尝试让模型完成一个需要多步的任务："创建一个 hello.txt，写入 Hello World，然后读取并确认内容"

## 下一课预告

Agent 跑起来了，但你有没有注意到 `messages` 数组的结构？每轮对话，它里面都在积累越来越复杂的数据。下一课 **s04 消息管理** 将深入这个数组，给它一套类型系统和管理策略。
