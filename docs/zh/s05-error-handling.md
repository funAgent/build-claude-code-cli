# s05 — 错误处理

> **An agent that crashes on the first error is not an agent**

`[ Phase 1: 最小 Agent ]` · 工具数: 1 · 代码量: ~200 行

---

## 前置知识

- 需要完成: s04 [消息管理]

## 你将学到

- Agent 中两种错误的不同处理策略
- API 错误（网络/限流）→ 指数退避重试
- 工具错误（命令失败）→ 作为 `is_error: true` 返回，让模型自修正
- 为什么"不要 crash"是 Agent 的生存法则

## 问题场景

s04 的 Agent 在正常情况下运行良好，但现实中充满意外：

- API 返回 429（限流）——你的调用太频繁了
- API 返回 500（服务端错误）——Claude 服务暂时不可用
- 工具执行失败——用户让 Agent 查看一个不存在的文件
- 网络中断——WiFi 突然断了

一个 `try { } catch { process.exit(1) }` 就让 Agent 变成了"一碰就碎"的玻璃。真正的 Agent 需要韧性。

## 设计决策

### 两种错误，两种策略

| 错误类型 | 策略 | 原因 |
|----------|------|------|
| API 错误 | 指数退避重试 | 大多数是暂时性的，等一等就好 |
| 工具错误 | 告诉模型，让它修正 | 模型可能换个命令或换个方式 |

这个区分至关重要：API 错误是"通道问题"，重试是正确做法；工具错误是"内容问题"，让模型知道并修正才是正确做法。

### 退避策略

```
delay = min(baseDelay × 2^attempt + random_jitter, maxDelay)
```

| 重试次数 | 延迟范围 |
|----------|---------|
| 第 1 次 | 1-2 秒 |
| 第 2 次 | 2-3 秒 |
| 第 3 次 | 4-5 秒 |

加随机 jitter 避免多个客户端同时重试导致"雷群效应"。

## 动手实现

### 步骤 1: 指数退避重试

可重试的错误码：429（限流）、529（过载）、5xx（服务端错误）、网络超时。

```typescript
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try { return await fn(); }
    catch (error) {
      if (!isRetryableError(error) || attempt === maxRetries) throw error;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      await sleep(delay);
    }
  }
}
```

> 完整实现见 **源码** 标签页的 `retry.ts`

### 步骤 2: 工具错误作为 tool_result 返回

关键洞察——**不要 catch 然后 crash，把错误告诉模型**：

```typescript
try {
  const result = await execShell(command);
  // 即使 exitCode !== 0，也作为 tool_result 返回
  toolResults.push({
    type: "tool_result",
    tool_use_id: id,
    content: output,
    ...(isError ? { is_error: true } : {}),
  });
} catch (toolError) {
  // 即使工具完全崩溃，也包装成 tool_result
  toolResults.push({
    type: "tool_result",
    tool_use_id: id,
    content: `Tool execution error: ${errMsg}`,
    is_error: true,
  });
}
```

> 完整实现见 **源码** 标签页的 `agent.ts`

## 运行验证

```bash
npm run dev "查看一个不存在的文件 /tmp/nonexistent.txt 的内容"
# 观察：模型会收到错误，尝试换个方式（比如先 ls 看看有什么文件）
```

> 点击 **模拟器** 标签页查看错误恢复的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| API 重试 | 指数退避 3 次 | 相同 + 降级到备用模型 |
| 工具错误 | is_error: true | 相同 + synthetic tool_result 确保每个 tool_use 有配对 |
| prompt-too-long | 未处理 | 自动压缩上下文后重试 |
| 最终兜底 | throw 然后停止 | circuit breaker + 恢复消息 |

> 更详细的架构对照见 **深入** 标签页

## 深入思考

**Q: 为什么不能简单地 try/catch + console.error？**

A: 因为 API 要求每个 `tool_use` 都必须有配对的 `tool_result`。如果你 catch 了错误然后 break 循环，下一次 API 调用会因为缺少 tool_result 而失败。Claude Code 的 `yieldMissingToolResultBlocks` 确保即使在异常中断时也能补齐所有 tool_result。

**Q: 模型真的能自修正吗？**

A: 是的。当你传入 `is_error: true` 和错误信息后，模型会分析错误原因并尝试换一种方式。比如 `cat nonexistent.txt` 失败后，模型通常会先 `ls` 看看有什么文件，再去读取正确的文件。

## 动手练习

1. 添加一个 `--max-retries` CLI 参数，让用户控制最大重试次数
2. 实现"降级模型"：当 `claude-sonnet-4-20250514` 失败时，自动切换到 `claude-haiku-4-20250514`
3. 给重试过程加上倒计时显示，让用户知道还要等多久

## 下一课预告

Agent 的行为被很多"魔法数字"控制——模型名、最大轮次、超时时间……下一课 **s06 配置管理** 将把这些硬编码变成可配置的多层配置系统。
