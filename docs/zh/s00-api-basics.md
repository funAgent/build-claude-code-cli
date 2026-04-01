# s00 — AI API 入门

> **Before building an agent, understand how to talk to the model**

`[ Phase 0: 预备知识 ]` · 工具数: 0 · 代码量: ~50 行

---

## 前置知识

- 熟悉 TypeScript / JavaScript
- 有 Node.js 开发环境
- 有 Anthropic API Key（[获取地址](https://console.anthropic.com/)）

## 你将学到

- Anthropic Messages API 的基本用法
- `messages` 数组的数据结构
- `stop_reason` 字段的含义
- 多轮对话中 messages 是如何增长的

## 问题场景

你想做一个 AI 助手，但在那之前，你需要先搞清楚：怎么用代码和 AI 模型"说话"？

大语言模型不是一个持续运行的服务——每次调用都是独立的 HTTP 请求。你发一个 `messages` 数组过去，模型返回一个 `response`。就这么简单。

## 核心概念

### Messages API 的请求和响应

Anthropic 的 Messages API 接受三个核心参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型名称 |
| `max_tokens` | number | 最大输出 token 数 |
| `messages` | array | 对话历史 |

`messages` 数组中每个元素是一个消息对象：

```typescript
{ role: "user" | "assistant", content: string }
```

响应中需要关注的字段：

| 字段 | 说明 |
|------|------|
| `content` | 模型输出的内容块数组（文本、工具调用等） |
| `stop_reason` | 停止原因：`end_turn`（回复结束）、`tool_use`（要调用工具） |
| `usage` | token 使用量（`input_tokens`、`output_tokens`） |

### stop_reason 是 Agent 的决策信号

`stop_reason` 是整个 Agent 循环的关键判断条件：

- `end_turn` — 模型认为已经回答完毕，不需要做更多事
- `tool_use` — 模型决定调用一个工具，需要你执行后把结果返回
- `max_tokens` — 输出被截断了，可能需要请求继续

后面的 s03 课中，你会用到 `stop_reason === "tool_use"` 来驱动整个 Agent 循环。

## 动手实现

### 步骤 1: 初始化项目

```bash
cd agents/s00-api-basics
npm install
cp .env.example .env
```

### 步骤 2: 单次调用

核心代码只有几行——创建客户端，发送消息，解析响应：

```typescript
const client = new Anthropic();
const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "用一句话解释：什么是 AI Agent？" }],
});
const textBlock = response.content.find((b) => b.type === "text");
```

注意几个要点：
- `new Anthropic()` 自动从 `ANTHROPIC_API_KEY` 环境变量读取密钥
- `response.content` 是一个数组，需要找到 `type === "text"` 的内容块
- `stop_reason` 这里是 `end_turn`，因为模型只是回答问题，没有工具调用

> 完整源码见 **Code** 标签页的 `index.ts`

### 步骤 3: 多轮对话

多轮对话的核心是：**每次调用后，把模型的回复也 push 进 messages 数组**。

```typescript
messages.push({ role: "user", content: userInput });
const response = await client.messages.create({ model, max_tokens, messages });
messages.push({ role: "assistant", content: assistantText });
```

每轮对话后，`messages` 数组增长两条（一条 user，一条 assistant）。模型每次都能看到完整的对话历史。

> 完整源码见 **Code** 标签页的 `chat.ts`

## 运行验证

```bash
npm run dev    # 单次调用
npm run chat   # 多轮对话
```

> 点击 **Simulate** 标签页查看终端运行效果的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| API 客户端 | `new Anthropic()` | `services/api/claude.ts` |
| 消息格式 | 直接使用 SDK 类型 | 自定义 `Message` 类型封装 |
| 错误处理 | `.catch(console.error)` | 重试 + 流式回退 + 降级 |

> 更详细的架构对照见 **Deep Dive** 标签页

## 深入思考

**Q: 为什么 response.content 是一个数组而不是字符串？**

A: 因为模型的一次回复可能包含多种内容块。除了文本（`text`），还可能包含工具调用请求（`tool_use`）和思考过程（`thinking`）。这个设计为 Agent 的工具调用能力打下了基础。

**Q: messages 数组越来越长，会不会有问题？**

A: 会。每个模型都有上下文窗口限制（如 200k tokens）。当 messages 太长时需要"压缩"——这就是 s24-s26 课要解决的问题。Claude Code 使用了三层压缩策略来处理这个问题。

## 动手练习

试着修改代码，让 `chat.ts` 支持一个 system prompt：

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  system: "你是一个 TypeScript 专家，回答要简洁。",
  messages,
});
```

观察加了 `system` 参数后，模型的回复风格有什么变化。

## 下一课预告

下一课 **s01 CLI 脚手架** 将把这段代码包装成一个正式的 CLI 命令行工具——你可以用 `npx mycli` 来启动它，而不是直接跑 `tsx src/index.ts`。
