# s25 — 多层压缩策略：一种压缩方式不够

> **One strategy is not enough; layer your defenses.**

`[ Phase 6: 上下文管理 ]` · 工具数: 9 · 代码量: ~400 行

---

## 前置知识

- 需要完成: s24 [自动压缩]

## 你将学到

- 三层压缩策略递进：<abbr data-tip="零成本的本地压缩策略，不调用 API，直接将旧工具结果替换为占位符来释放 token">微压缩</abbr> → 自动压缩 → <abbr data-tip="当 API 调用因 prompt 过长被拒绝时触发的紧急压缩，先执行微压缩再做摘要压缩">响应式压缩</abbr>
- 微压缩（microcompact）算法：零成本清理旧工具结果
- 响应式压缩（reactive compact）：prompt-too-long 错误兜底
- <abbr data-tip="熔断器模式——当连续失败次数超过阈值时自动停止重试，防止级联故障浪费资源">Circuit Breaker</abbr> 熔断模式在压缩中的应用

## 问题场景

s24 的自动压缩解决了长对话溢出的问题，但存在两个缺陷：

```
缺陷 1: 工具结果占用大量空间但过早压缩浪费

  消息 #5:  file_read 输出 (8K tokens)   ← 已过时
  消息 #8:  bash 输出 (12K tokens)        ← 已过时
  消息 #12: grep 输出 (5K tokens)         ← 已过时
  消息 #25: file_read 输出 (3K tokens)    ← 当前有用
  ────────────────────────────────────
  这些旧工具结果占了 25K tokens，清理它们不需要 API 调用！

缺陷 2: prompt-too-long 错误没有兜底

  estimateTokenCount 有 ±20% 误差
  → 可能在阈值以下但实际 token 数已超上限
  → API 返回 "prompt is too long" 错误
  → 没有 reactive 机制来处理这种情况
```

**一种压缩策略不够。** 需要多层策略：先免费清理，再 API 压缩，最后紧急兜底。

## 设计决策

### 三层压缩策略

```
压缩策略递进：

  Layer 1: 微压缩 (microcompact)
  ┌──────────────────────────────────────────┐
  │  成本: 零（纯本地操作）                   │
  │  触发: 每轮对话前 或 token 达到 70% 阈值   │
  │  做法: 清理老旧工具结果 → 替换为占位符      │
  │  效果: 释放 10-50K tokens                 │
  └──────────────────┬───────────────────────┘
                     │ 不够？
                     ↓
  Layer 2: 自动压缩 (autocompact)
  ┌──────────────────────────────────────────┐
  │  成本: 一次 API 调用                      │
  │  触发: token > 171K（与 s24 相同）         │
  │  做法: 模型生成对话摘要                    │
  │  效果: 释放 80-95% tokens                 │
  └──────────────────┬───────────────────────┘
                     │ API 报错？
                     ↓
  Layer 3: 响应式压缩 (reactive compact)
  ┌──────────────────────────────────────────┐
  │  成本: 微压缩 + 一次 API 调用             │
  │  触发: prompt-too-long 错误               │
  │  做法: 先微压缩 → 再 API 摘要 → 重试      │
  │  效果: 错误恢复                           │
  └──────────────────┬───────────────────────┘
                     │ 连续 3 次失败？
                     ↓
  Circuit Breaker: 熔断
  ┌──────────────────────────────────────────┐
  │  停止所有压缩尝试                         │
  │  提示用户开启新对话                        │
  └──────────────────────────────────────────┘
```

### 微压缩算法

```
微压缩选择算法：

  所有 tool_result blocks:
  ┌─────┬──────────┬──────────┬──────────────┐
  │ #3  │ #5       │ #8       │ #12          │ ...
  │ grep│ file_read│ bash     │ grep         │
  │ 5K  │ 8K       │ 12K      │ 5K           │
  └──┬──┴────┬─────┴────┬─────┴──────┬───────┘
     │       │          │            │
     ↓       ↓          ↓            ↓
  可压缩   可压缩     可压缩      可压缩

  保留最近 5 个 → 清理其余

  清理前: [grep:5K] [read:8K] [bash:12K] [grep:5K] ... [read:3K]
  清理后: [占位符]  [占位符]   [占位符]   [grep:5K] ... [read:3K]
                                         ↑ 保留最近 5 个
  释放: 25K tokens（完全免费）
```

## 实现

### Layer 1: 微压缩

```typescript
const COMPACTABLE_TOOLS = new Set([
  "file_read", "bash", "grep", "glob", "ls",
  "web_search", "web_fetch",
]);

const CLEARED_MESSAGE = "[此工具结果已被微压缩清理]";
const KEEP_RECENT = 5;

export function microcompactMessages(
  messages: Anthropic.MessageParam[],
): { messages: Anthropic.MessageParam[]; freedTokens: number } {
  // 1. 收集所有可压缩的 tool_result
  const candidates = collectCompactableCandidates(messages);

  // 2. 保留最近 KEEP_RECENT 个
  if (candidates.length <= KEEP_RECENT) return { messages, freedTokens: 0 };

  // 3. 清理其余（原地替换）
  const toClean = candidates.slice(0, candidates.length - KEEP_RECENT);
  for (const { msgIdx, blockIdx } of toClean) {
    messages[msgIdx].content[blockIdx].content = CLEARED_MESSAGE;
  }

  return { messages, freedTokens: calculateFreed(toClean) };
}
```

关键点：微压缩是**原地操作**，不创建新数组。`KEEP_RECENT = 5` 确保最近的工具结果不被清理——模型可能还需要引用它们。

### Layer 3: Reactive Compact

```typescript
export function isPromptTooLongError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes("prompt is too long") ||
           error.message.includes("prompt_too_long");
  }
  return false;
}

// agent.ts 中的错误处理
try {
  response = await this.streamTurn(this.messages, onOutput);
} catch (error) {
  if (isPromptTooLongError(error)) {
    // 紧急压缩
    const result = await reactiveCompact(
      this.messages, this.client, this.compactState
    );
    this.messages = result.messages;
    // 压缩后重试
    response = await this.streamTurn(this.messages, onOutput);
  }
}
```

### Agent 集成：策略递进

```typescript
// agent.ts — run() 循环内

// 每轮开始前：Layer 1
const mcResult = tryMicroCompact(this.messages, this.compactState);
this.messages = mcResult.messages;

// API 调用（可能触发 Layer 3）
try {
  response = await this.streamTurn(this.messages, onOutput);
} catch (error) {
  if (isPromptTooLongError(error)) {
    const result = await reactiveCompact(...);
    this.messages = result.messages;
    response = await this.streamTurn(this.messages, onOutput);  // 重试
  }
}

// 每轮结束后：Layer 2
await this.maybeAutoCompact(onOutput);
```

## 运行验证

```bash
cd agents/s25-multi-compact

# 启动 Agent
npm run dev

# 多次读取大文件，观察微压缩行为
# 当工具结果数量超过 5 个时，旧的会被替换为占位符
```

## 对照 Claude Code

| 维度 | 教学版 (s25) | Claude Code |
|------|-------------|-------------|
| 微压缩触发 | 每轮固定检查 | time-based（距上次活跃 N 分钟）+ cached MC（API 层 cache_edits） |
| 可压缩工具 | 7 个硬编码 | `COMPACTABLE_TOOLS` 列表，与工具注册表联动 |
| 保留数量 | `KEEP_RECENT = 5` | `keepRecent` 由 config/GrowthBook 控制 |
| 缓存微压缩 | 无 | cached microcompact — 在 API 请求层面做 cache_edits，不修改本地消息 |
| Reactive 触发 | 捕获错误字符串 | `PROMPT_TOO_LONG_ERROR_MESSAGE` 常量匹配 |
| 熔断阈值 | 3 次 | 同（`MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`） |
| Context Collapse | 无 | 激进模式：直接丢弃中间消息，保留首尾 |

**Claude Code 的多层压缩架构**：

```
query loop 每轮:
  │
  ├── microcompactMessages(messages)
  │     ├── time-based: 距上次 > N分钟 → 清理
  │     └── cached: 注册 cache_edits → API 层应用
  │
  ├── API 调用
  │     └── 失败 → isPromptTooLong?
  │           ├── Yes → reactiveCompact()
  │           │         ├── microcompact
  │           │         ├── compactConversation
  │           │         └── 重试 API
  │           └── No → 其他错误处理
  │
  └── autoCompactIfNeeded()
        ├── shouldAutoCompact() — 阈值检查
        ├── trySessionMemoryCompaction() — 优先
        └── compactConversation() — 兜底
```

## 深入思考

1. **免费操作优先**：微压缩不调 API，零成本。在对话中期就开始清理旧工具结果，延迟 autocompact 的触发时间，节省 API 成本。
2. **策略递进的重要性**：如果只有 autocompact，短对话也会不必要地触发 API 压缩。如果只有 microcompact，深度对话无法被有效压缩。分层让每种策略在最合适的场景发挥作用。
3. **Circuit Breaker 模式**：来自微服务架构的经典模式。如果压缩服务（API 摘要）连续失败，继续重试只会浪费 token。熔断后提示用户开新对话是更好的选择。

## 练习

1. 调低 `KEEP_RECENT` 为 2，观察更激进的微压缩行为

<details>
<summary>练习 1 参考实现</summary>

调整微压缩保留数量：

```typescript
const KEEP_RECENT = 2; // 从 5 改为 2

// 添加调试日志
export function microcompactMessages(messages) {
  const candidates = collectCompactableCandidates(messages);
  console.log(`[microcompact] candidates: ${candidates.length}, keep: ${KEEP_RECENT}`);
  if (candidates.length <= KEEP_RECENT) return { messages, freedTokens: 0 };
  const toClean = candidates.slice(0, candidates.length - KEEP_RECENT);
  console.log(`[microcompact] cleaning ${toClean.length} old results`);
  // ...
}
```

**预期观察**：保留数从 5 降到 2 后，微压缩会更频繁地触发。在读取 3 个以上文件时，最早的工具结果就会被替换为占位符。

</details>
2. 实现 time-based 微压缩：超过 5 分钟未被引用的工具结果自动清理
3. 添加压缩统计面板：显示每层压缩的触发次数和释放 token 数

## 下一课预告

多层压缩解决了对话历史的 token 膨胀，但还有一种特殊情况：单个工具结果本身就可能有数十万字符。下一课 **s26 大输出处理** 将实现工具结果的持久化与预算控制，让超大文件读取不再撑爆 context window。
