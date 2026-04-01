# s04 — 消息管理

> **The messages array IS the agent's memory**

`[ Phase 1: 最小 Agent ]` · 工具数: 1 · 代码量: ~150 行

---

## 前置知识

- 需要完成: s03 [Agent Loop]

## 你将学到

- messages 数组的本质——它是 Agent 的全部记忆
- 如何设计消息类型系统
- 工具输出的截断策略——防止单条消息撑爆上下文窗口
- 消息格式化——让终端输出可读
- 对话统计——追踪消息数量和 token 消耗

## 问题场景

s03 的 Agent 能跑了，但有两个问题：

1. **messages 数组是黑箱**：每轮循环往里塞数据，但你不知道它长什么样、有多大、每条消息是什么类型
2. **工具输出没有限制**：如果工具返回了 100KB 的日志文件，全部塞进 messages 会浪费大量 token

这一课，我们给 messages 数组装上"仪表盘"——类型系统让你知道每条消息是什么，格式化让你看得清，截断让它不会爆炸。

## 设计决策

### 自定义类型 vs 直接用 SDK 类型

| 方案 | 优点 | 缺点 |
|------|------|------|
| 直接用 `Anthropic.MessageParam` | 零额外代码 | 没有时间戳、token 统计等元数据 |
| 自定义 `AgentMessage` 包装 | 可扩展元数据 | 需要转换层 |

我们选择自定义类型。Claude Code 也有自己的 `Message` 类型层级（7+ 种类型），在 SDK 之上加了 `uuid`、`isMeta`、`isCompactSummary` 等 20+ 个字段。

### 截断策略

| 策略 | 优点 | 缺点 |
|------|------|------|
| 不截断 | 信息完整 | 可能超出上下文窗口 |
| 固定字符数截断 | 简单 | 可能在关键位置切断 |
| Token 预算截断 | 精确控制成本 | 需要 token 计数器 |

教学版用固定字符数（10,000 字符）。Claude Code 使用 token 预算 + 磁盘替换（s26 课会实现）。

## 动手实现

### 步骤 1: 定义消息类型

在 SDK 的 `ContentBlock` 之上包装一层，加入元数据：

```typescript
interface AgentMessage {
  role: "user" | "assistant";
  content: string | ContentBlockParam[];
  timestamp: number;
  tokenCount?: { input: number; output: number };
}
```

> 完整类型定义和工厂函数见 **Code** 标签页的 `types.ts`

### 步骤 2: 消息截断

防止单条工具输出太长：

```typescript
function truncateContent(content: string, maxLen = 10_000): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + `\n...[内容已截断，原始长度: ${content.length} 字符]`;
}
```

### 步骤 3: Agent 类化

把 s03 的函数式 Agent 改为类，持有 `history` 数组：

```typescript
class Agent {
  private history: AgentMessage[] = [];
  async run(userInput: string): Promise<void> { /* ... */ }
  showStats(): void { /* ... */ }
}
```

> 完整实现见 **Code** 标签页

## 运行验证

```bash
npm run dev "帮我看看 package.json 的内容"
npm run dev   # 交互模式，输入 /stats 查看统计
```

> 点击 **Simulate** 标签页查看消息流转的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| 消息类型 | 3 种（user/assistant/tool_result） | 7+ 种（含 system/attachment/progress/grouped） |
| 元数据 | timestamp + tokenCount | uuid + isMeta + isCompactSummary + 20+ 字段 |
| 截断 | 固定 10,000 字符 | token 预算 + 磁盘替换 |
| API 转换 | `toApiMessages()` | `normalizeMessagesForAPI()` — 合并、去重、验证 |
| UI 格式化 | `formatMessage()` | `reorderMessagesInUI()` — 工具使用分组 |

> 更详细的架构对照见 **Deep Dive** 标签页

## 深入思考

**Q: 为什么 Claude Code 的消息类型这么多？**

A: 产品化后，消息不只是 user/assistant。还需要：system 消息（状态提示）、attachment 消息（文件/图片）、progress 消息（进度条）、grouped 消息（多工具折叠显示）。每种类型有不同的渲染逻辑和 API 转换规则。

**Q: 为什么截断要加提示文字？**

A: 模型需要知道它看到的不是完整输出。如果直接切断，模型可能基于不完整的信息做出错误判断。加上 `[内容已截断]` 后，模型知道该自己再去获取更多信息。

## 动手练习

1. 给 `AgentMessage` 添加一个 `id` 字段（UUID），用 `crypto.randomUUID()` 生成
2. 实现一个 `/history` 命令，打印当前 messages 数组的结构（每条消息的 role、content 类型、大小）
3. 修改截断逻辑：对代码类输出保留头尾各 30%，中间截断

## 下一课预告

Agent 会自我修正吗？如果工具执行出错了怎么办？如果 API 返回 429 限流了呢？下一课 **s05 错误处理** 将让你的 Agent 具备"失败后自我恢复"的能力。
