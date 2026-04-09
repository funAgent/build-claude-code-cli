# s00 — AI API 入门

> **Before building an agent, understand how to talk to the model**

`[ Phase 0: 预备知识 ]` · 工具数: 0 · 代码量: ~50 行

---

## 前置知识

- 熟悉 TypeScript / JavaScript
- 有 Node.js 开发环境
- 有 Anthropic API Key（[获取地址](https://console.anthropic.com/)），或智谱 GLM API Key（[获取地址](https://open.bigmodel.cn/)）作为替代

## 你将学到

- Anthropic Messages API 的基本用法
- `messages` 数组的数据结构
- `stop_reason` 字段的含义
- 多轮对话中 messages 是如何增长的

## 问题场景

你想做一个 AI 助手，但在那之前，你需要先搞清楚：怎么用代码和 AI 模型"说话"？

<abbr data-tip="Large Language Model，通过海量文本训练的 AI 模型，能理解和生成自然语言。如 GPT、Claude、GLM 都是 LLM。">大语言模型</abbr>（LLM）不是一个持续运行的服务——每次调用都是独立的 HTTP 请求。你发一个 `messages` 数组过去，模型返回一个 `response`。就这么简单。

## 核心概念

### Messages API 的请求和响应

Anthropic 的 Messages API 接受三个核心参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型名称 |
| `max_tokens` | number | 最大输出 <abbr data-tip="模型处理文本的最小单位。1 个中文字约 1-2 个 token，1 个英文单词约 1 个 token。API 按 token 数量计费。">token</abbr> 数 |
| `messages` | array | 对话历史 |

`messages` 数组中每个元素是一个消息对象：

```typescript
{ role: "user" | "assistant", content: string }
```

响应中需要关注的字段：

| 字段 | 说明 |
|------|------|
| `content` | 模型输出的 <abbr data-tip="Messages API 的响应 content 是一个数组，每个元素叫 content block，可以是文本(text)、工具调用(tool_use)等类型。">内容块</abbr>数组（文本、工具调用等） |
| `stop_reason` | 停止原因：`end_turn`（回复结束）、`tool_use`（要调用工具） |
| `usage` | <abbr data-tip="模型处理文本的最小单位。1 个中文字约 1-2 个 token，1 个英文单词约 1 个 token。API 按 token 数量计费。">token</abbr> 使用量（`input_tokens`、`output_tokens`） |

### stop_reason 是 Agent 的决策信号

`stop_reason` 是整个 Agent 循环的关键判断条件：

- `end_turn` — 模型认为已经回答完毕，不需要做更多事
- `tool_use` — 模型决定调用一个 <abbr data-tip="模型决定调用一个外部工具（如读文件、搜索代码）时返回的类型。Agent 通过不断调用工具来完成任务，tool_use 是 Agent 能力的核心信号。后续 s03 课会深入。">工具</abbr>，需要你执行后把结果返回
- `max_tokens` — 输出被截断了，可能需要请求继续

后面的 s03 课中，你会用到 `stop_reason === "tool_use"` 来驱动整个 Agent 循环。

## 动手实现

### 步骤 1: 初始化项目

```bash
cd agents/s00-api-basics
npm install
cp .env.example .env
```

编辑 `.env` 文件，填入你的 API Key。如果没有 Anthropic API Key，可以使用智谱 GLM 作为替代：

```bash
# 使用 Anthropic（默认）
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx

# 使用智谱 GLM（替代方案）
ANTHROPIC_API_KEY=your-glm-api-key
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
MODEL_NAME=glm-4.7
```

> 智谱 GLM 提供兼容 Anthropic 的 API 接口，Anthropic SDK 的 `ANTHROPIC_BASE_URL` 环境变量会自动切换请求地址，代码无需任何修改。

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

> 完整代码见 **源码** 标签页的 `index.ts`

### 步骤 3: 多轮对话

多轮对话的核心是：**每次调用后，把模型的回复也 push 进 messages 数组**。

```typescript
messages.push({ role: "user", content: userInput });
const response = await client.messages.create({ model, max_tokens, messages });
messages.push({ role: "assistant", content: assistantText });
```

每轮对话后，`messages` 数组增长两条（一条 user，一条 assistant）。模型每次都能看到完整的对话历史。

```
Round 1:  messages = [user①]
                         ↓ API 调用
          response = assistant①
          messages = [user①, assistant①]

Round 2:  messages = [user①, assistant①, user②]
                                    ↓ API 调用
          response = assistant②
          messages = [user①, assistant①, user②, assistant②]

Round 3:  messages = [user①, assistant①, user②, assistant②, user③]
                                                  ↓ API 调用
          ...以此类推，input_tokens 逐轮递增...
```

> 源码中 `chat.ts` 的注释把 messages 数组称为"Agent 的记忆原型"——这个比喻很准确。后续所有 Agent 的对话管理，都是在这个基础模式上扩展的。

> 完整代码见 **源码** 标签页的 `chat.ts`

## 运行验证

```bash
npm run dev    # 单次调用
npm run chat   # 多轮对话
```

> 点击 **模拟器** 标签页查看终端运行效果的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| API 客户端 | `new Anthropic()` | `services/api/claude.ts` |
| 消息格式 | 直接使用 SDK 类型 | 自定义 `Message` 类型封装 |
| 错误处理 | `.catch(console.error)` | 重试 + 流式回退 + 降级 |

> 更详细的架构对照见 **深入** 标签页

## 深入思考

**Q: 为什么 response.content 是一个数组而不是字符串？**

A: 因为模型的一次回复可能包含多种内容块。除了文本（`text`），还可能包含工具调用请求（`tool_use`）和思考过程（`thinking`）。这个设计为 Agent 的工具调用能力打下了基础。

**Q: messages 数组越来越长，会不会有问题？**

A: 会。每个模型都有<abbr data-tip="模型单次请求能处理的最大 token 数量。Claude 的上下文窗口为 200k tokens，超过就需要压缩或截断。">上下文窗口</abbr>限制（如 200k tokens）。当 messages 太长时需要"压缩"——这就是 s24-s26 课要解决的问题。Claude Code 使用了三层压缩策略来处理这个问题。

**Q: 为什么 `system` prompt 不在 `messages` 数组里，而是单独的顶层参数？**

A: 这是 API 的有意设计。`system` 是"全局指令"，每次请求都会生效，不属于对话历史的一部分。把它和 `messages` 分离有两个好处：一是语义清晰——system 是"你是谁"，messages 是"聊了什么"；二是方便管理——你可以随时换 system prompt 而不用动对话历史。s17 课会详细讲 system prompt 的设计。

**Q: `new Anthropic()` 不传参数就能工作，它是怎么找到我的 API Key 的？**

A: SDK 会自动读取环境变量 `ANTHROPIC_API_KEY`。这是 Node.js 生态的常见约定——通过环境变量传递敏感信息，避免把密钥硬编码在代码里。如果你传了 `apiKey` 参数，则以参数为准。同理，`ANTHROPIC_BASE_URL` 环境变量可以切换 API 地址，这就是智谱 GLM 兼容方案的原理。

## 练习

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

<details>
<summary>参考实现</summary>

修改 `chat.ts`，在 `client.messages.create()` 调用中加入 `system` 参数：

```typescript
const response = await client.messages.create({
  model: MODEL,
  max_tokens: 1024,
  system: "你是一个 TypeScript 专家，回答要简洁，用中文。",
  messages,
});
```

**观察效果**：加上 `system` 后，模型回答会明显聚焦在 TypeScript 领域，回复风格也更简洁。如果你问"Python 的列表怎么用"，模型可能会提醒你它专注 TypeScript，或者以对比的方式回答。

`system` 参数和 `messages` 数组是分离的——它不属于对话历史，而是每次请求都会携带的"全局指令"。后续 s17 课会深入讲解 system prompt 的设计。

</details>

## 下一课预告

下一课 **s01 CLI 脚手架** 将把这段代码包装成一个正式的 CLI 命令行工具——你可以用 `npx mycli` 来启动它，而不是直接跑 `tsx src/index.ts`。
