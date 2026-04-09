# s24 — 自动压缩：让 Agent 能进行无限长度的对话

> **Context is finite; memory need not be.**

`[ Phase 6: 上下文管理 ]` · 工具数: 9 · 代码量: ~350 行

---

## 前置知识

- 需要完成: s23 [启动性能优化]

## 你将学到

- Context window 阈值检测与 <abbr data-tip="通过字符数除以 4 粗略计算 token 数的方法，比加载完整 tokenizer 更快但有 ±20% 误差">token 估算</abbr>
- 摘要压缩（compact）的完整流水线：阈值检查 → 生成摘要 → 重建消息数组
- Compact Boundary 消息的设计原理
- <abbr data-tip="当系统连续失败达到阈值时自动停止尝试的保护模式，源自微服务架构的 Circuit Breaker 设计">熔断机制</abbr>防止压缩失败循环

## 问题场景

用户和 Agent 已经对话了 30 轮。每轮都有工具调用和结果，messages 数组已经膨胀到 ~180K tokens：

```
Context Window 使用情况：

  0K        50K       100K       150K       200K
  ├─────────┼─────────┼─────────┼─────────┤
  ████████████████████████████████████████░░  ← 90% 已用
                                          ↑
                                      即将溢出！

  █ = 已使用 (~180K tokens)
  ░ = 剩余空间 (~20K tokens)
  — = 模型输出预留 (16K tokens)
```

下一轮 API 调用将失败：`prompt is too long: 185632 tokens > 183616 max`。

**<abbr data-tip="模型单次请求能处理的最大 token 数量，由模型决定，如 Claude 的 200K tokens">Context window</abbr> 是有限的。** 对话越长，积累的消息越多，最终一定会撞到上限。

## 设计决策

### 为什么不直接删除旧消息？

```
方案对比：

  方案 A: 滑动窗口（删除最旧的 N 条消息）
  ┌──────────────────────────────────────────┐
  │  ✗ 丢失早期关键决策                       │
  │  ✗ 可能砍断工具调用/结果对                 │
  │  ✗ 模型突然"失忆"，重复已做过的事           │
  └──────────────────────────────────────────┘

  方案 B: 摘要压缩（用模型总结历史）          ← 选择
  ┌──────────────────────────────────────────┐
  │  ✓ 保留关键信息的骨架                     │
  │  ✓ 模型知道之前做了什么                   │
  │  ✓ 结构化摘要可以精确控制保留什么          │
  └──────────────────────────────────────────┘
```

**压缩不是删除历史，是用摘要替换细节——保留记忆的骨架。**

### 阈值设计

```
Context Window 分层：

  200K tokens（模型上下文窗口）
  ├────────────────────────────────────────┤
  │                                        │
  │  有效上下文 = 200K - 16K = 184K        │
  │  ├──────────────────────────────────┤  │
  │  │                                  │  │
  │  │  压缩阈值 = 184K - 13K = 171K   │  │
  │  │  ├──────────────────────────┤    │  │
  │  │  │                          │    │  │
  │  │  │  正常对话空间 (171K)      │    │  │
  │  │  │                          │    │  │
  │  │  ├──────────────────────────┤    │  │
  │  │  │  缓冲区 (13K)            │    │  │
  │  │  ├──────────────────────────┤    │  │
  │  ├──────────────────────────────────┤  │
  │  │  输出预留 (16K)                  │  │
  ├────────────────────────────────────────┤

  为什么留 13K 缓冲？
  → 压缩本身需要时间，期间可能还有新消息进来
  → 留出足够空间避免在压缩过程中就溢出
```

### 压缩流程

```
压缩执行流水线：

  ┌─ 1. 阈值检查 ──────────────────────┐
  │  estimateTokenCount(messages)       │
  │  > COMPACT_THRESHOLD ?              │
  └──────────┬─────────────────────────┘
             │ Yes
             ↓
  ┌─ 2. 构建压缩请求 ─────────────────┐
  │  messages + getCompactPrompt()      │
  │  → 发给模型做摘要                   │
  └──────────┬─────────────────────────┘
             ↓
  ┌─ 3. 生成摘要 ─────────────────────┐
  │  模型返回结构化摘要                 │
  │  保留：需求、决策、文件修改、待办    │
  │  丢弃：工具详细输出、试错过程        │
  └──────────┬─────────────────────────┘
             ↓
  ┌─ 4. 重建消息数组 ─────────────────┐
  │  [compact_boundary]  ← 摘要        │
  │  [assistant_ack]     ← 确认        │
  │  [last_user_msg]     ← 最近一轮    │
  │  [last_assistant]    ← 最近一轮    │
  └────────────────────────────────────┘
```

## 实现

### Token 估算

```typescript
export function estimateTokenCount(
  messages: Anthropic.MessageParam[],
): number {
  let charCount = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      charCount += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if ("text" in block) charCount += block.text.length;
        if ("content" in block) charCount += block.content.length;
      }
    }
  }
  // 4 chars ≈ 1 token, ×4/3 safety margin
  return Math.ceil((charCount / 4) * (4 / 3));
}
```

为什么不用精确的 tokenizer？加载 tokenizer 本身就有开销（~50ms + 内存），对于阈值判断场景 ±20% 的误差完全可以接受。Claude Code 也用估算。

### 阈值判断

```typescript
export function shouldAutoCompact(
  messages: Anthropic.MessageParam[],
  state: CompactState,
): { shouldCompact: boolean; tokenCount: number } {
  // 熔断：连续失败太多次就放弃
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    return { shouldCompact: false, tokenCount: 0 };
  }
  const tokenCount = estimateTokenCount(messages);
  return {
    shouldCompact: tokenCount > COMPACT_THRESHOLD,
    tokenCount,
  };
}
```

### 执行压缩

```typescript
export async function compactConversation(
  messages: Anthropic.MessageParam[],
  client: Anthropic,
  state: CompactState,
): Promise<{ messages: Anthropic.MessageParam[]; summary: string }> {
  // 把历史 + 压缩请求发给模型
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: MAX_SUMMARY_TOKENS,
    system: "你是一个对话摘要助手。",
    messages: [...messages, { role: "user", content: getCompactPrompt() }],
  });

  const summary = extractText(response);

  // Compact Boundary: 用摘要替换旧消息
  const compactBoundary = {
    role: "user",
    content: `[对话摘要]\n${summary}\n[摘要结束]`,
  };

  // 保留最后一轮对话
  const lastTurn = getLastConversationTurn(messages);

  return {
    messages: [compactBoundary, assistantAck, ...lastTurn],
    summary,
  };
}
```

### Agent 集成

```typescript
// agent.ts — run() 循环内，每轮结束后
await this.maybeCompact(onOutput);

private async maybeCompact(onOutput): Promise<void> {
  const { shouldCompact, tokenCount } = shouldAutoCompact(
    this.messages, this.compactState
  );
  if (!shouldCompact) return;

  const result = await compactConversation(
    this.messages, this.client, this.compactState
  );
  this.messages = result.messages;  // 替换！
}
```

关键点：`this.messages` 是跨 `run()` 调用持久化的。压缩后直接替换引用。

## 运行验证

```bash
cd agents/s24-auto-compact

# 启动 Agent
npm run dev

# 进行多轮对话，观察当 token 数接近阈值时自动压缩的行为
# 压缩状态会通过 compact_status 类型输出显示
```

## 对照 Claude Code

| 维度 | 教学版 (s24) | Claude Code |
|------|-------------|-------------|
| 阈值检测 | `estimateTokenCount` 纯字符估算 | `tokenCountWithEstimation` — 精确 tokenizer + 缓存 |
| 阈值配置 | 硬编码 171K | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 环境变量 + `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 百分比覆盖 |
| 摘要生成 | 单次 API 调用 | `streamCompactSummary` — forked agent 复用 prompt cache + PTL 重试循环 |
| 消息重建 | 摘要 + 最后一轮 | 摘要 + 文件附件恢复 + plan 附件 + skill 附件 + async agent 附件 |
| 熔断机制 | 3 次连续失败 | 同（`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`） |
| 压缩触发源 | 仅主循环 | 排除 `session_memory` 和 `compact` 查询源（防递归） |
| 钩子系统 | 无 | `executePreCompactHooks` + `executePostCompactHooks` |
| 特性门控 | 无 | `DISABLE_COMPACT`、`DISABLE_AUTO_COMPACT`、GrowthBook flags |

**Claude Code 的压缩架构**：

```
autoCompactIfNeeded(messages, model, state)
  │
  ├── 检查 DISABLE_COMPACT / DISABLE_AUTO_COMPACT
  ├── 检查 consecutiveFailures >= 3（熔断）
  │
  ├── 尝试 session memory compaction（优先）
  │   └── 成功 → 重建 + 清理 + 返回
  │
  └── compactConversation(messages, ...)
        │
        ├── executePreCompactHooks()
        ├── streamCompactSummary()
        │     ├── forked agent（复用 prompt cache）
        │     └── PTL 重试循环（最多 3 次）
        │           └── truncateHeadForPTLRetry()
        │
        ├── buildPostCompactMessages()
        │     ├── createCompactBoundaryMessage()
        │     ├── createPostCompactFileAttachments()
        │     ├── createPlanAttachmentIfNeeded()
        │     └── createSkillAttachmentIfNeeded()
        │
        └── executePostCompactHooks()
```

生产版的复杂性主要来自两个方面：(1) forked agent 复用 prompt cache 降低成本；(2) post-compact 恢复机制确保压缩后模型不会"忘记"正在编辑的文件。

## 深入思考

1. **摘要质量决定一切**：摘要太简短，模型会"忘记"关键信息；太详细，压缩效果差。Claude Code 用结构化 prompt 引导摘要格式。
2. **压缩是有成本的**：每次压缩需要一次 API 调用（输入全部历史 + 输出摘要），token 消耗不小。这就是为什么需要阈值控制而不是每轮都压缩。
3. **Compact Boundary 的设计**：摘要作为 user 消息插入是 API 协议的要求（必须 user/assistant 交替）。`[摘要结束]` 标记让模型知道这是压缩产物而非用户输入。

## 练习

1. 修改 `COMPACT_THRESHOLD` 为一个较小的值（如 5000），然后进行几轮对话观察压缩行为

<details>
<summary>练习 1 参考实现</summary>

修改阈值并测试压缩：

```typescript
// 在 compact.ts 中修改阈值
const COMPACT_THRESHOLD = 5_000; // 从 171K 改为 5K（测试用）

// 在 agent.ts 的 maybeCompact 中添加日志
private async maybeCompact(onOutput) {
  const { shouldCompact, tokenCount } = shouldAutoCompact(
    this.messages, this.compactState
  );
  console.log(`[debug] tokenCount: ${tokenCount}, threshold: ${COMPACT_THRESHOLD}`);
  if (!shouldCompact) return;
  // ...
}
```

**预期行为**：设置低阈值后，几轮简单对话就会触发自动压缩。观察压缩前后 `tokenCount` 的变化，以及压缩后 messages 数组长度的缩减。

</details>
2. 改进 `getCompactPrompt()`：让摘要按"文件修改"、"决策记录"、"待办事项"分类
3. 实现"选择性保留"：保留最近 3 轮对话而非 1 轮，比较压缩后模型的表现

## 下一课预告

s24 的自动压缩解决了一部分问题，但工具结果占用的空间仍然很大，且 prompt-too-long 错误没有兜底。下一课 **s25 多层压缩策略** 将实现微压缩（零成本清理旧工具结果）和响应式压缩（紧急兜底），构建三层递进的压缩体系。
