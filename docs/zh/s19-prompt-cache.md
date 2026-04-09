# s19 — Prompt Cache：让重复 Prompt 不重复计费

## 问题场景

每次 API 调用，system prompt 都会被完整发送。一个有 9 个工具的 Agent，system prompt 大约 2000 token。对话 20 轮，就是 40000 token 的 system prompt 费用——但内容完全相同！

Anthropic 提供了 **Prompt Cache** 功能：标记一段前缀文本为可缓存，服务端会记住它，后续请求只要前缀一致，就以 cache read 计费（便宜 90%）。

## 设计决策

### DYNAMIC_BOUNDARY：划分静态/动态

```
┌─────────────────────────┐
│ identity (cacheable)    │  ← 不变：每次请求都一样
│ tool-guide (cacheable)  │  ← 不变：工具列表固定
├── DYNAMIC_BOUNDARY ─────┤
│ environment (dynamic)   │  ← 会变：日期、cwd
│ rules (dynamic)         │  ← 可能变：用户编辑了 RULES.md
│ style (cacheable)       │  ← 不变但放在动态区
└─────────────────────────┘
```

关键原则：**缓存前缀必须严格一致**。一个字符改变都会导致 cache miss。

### cache_control 注入

```typescript
// 静态前缀块
{ type: "text", text: staticContent, cache_control: { type: "ephemeral" } }
// 动态块
{ type: "text", text: dynamicContent }  // 无 cache_control
```

### 工具列表稳定排序的重要性

s12 已经做了工具列表稳定排序——这里解释为什么：

- `tools` 参数的前缀也参与缓存键
- 如果工具列表顺序不稳定，cache 命中率骤降
- 这就是 `assembleToolPool` 用显式数组而非 Set/Object.keys 的原因

## 实现要点

```typescript
export function splitPromptForCache(sections: PromptSection[]): SystemPromptBlock[] {
  const staticParts = sections.filter(s => s.cacheable).map(s => s.content);
  const dynamicParts = sections.filter(s => !s.cacheable).map(s => s.content);

  return [
    { text: staticParts.join("\n\n"), cacheScope: "ephemeral" },
    { text: dynamicParts.join("\n\n"), cacheScope: null },
  ];
}
```

Agent 构造时调用 `splitPromptForCache`，每次请求用 `buildSystemParam()` 构建带 `cache_control` 的 TextBlockParam[]。

## 运行验证

```bash
cd agents/s19-prompt-cache
npm install
npm run dev
# 连续发送几条消息
# 观察 API 响应中的 usage.cache_creation_input_tokens 和 cache_read_input_tokens
# 第二次请求应该有 cache_read > 0
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 边界标记 | `cacheable` 布尔 | `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 字符串 |
| 拆分逻辑 | 按 section 分组 | `splitSysPromptPrefix()` 按边界索引切割 |
| cache scope | `ephemeral` | `ephemeral` + `global`（跨组织） + TTL |
| 消息级缓存 | 无 | 对话最后一条消息也加 `cache_control` |

生产版还有 `scope: 'global'`（跨组织/会话缓存，命中率更高）和 `ttl: '1h'` 延长缓存。

## 深入思考

1. **Ephemeral vs Global cache**：ephemeral 是 5 分钟内同用户复用；global 是跨用户跨组织复用（需要前缀完全一致）。
2. **为什么 style section 标记为 cacheable 但放在动态区后面？** 因为 cache 要求前缀连续。style 内容虽然不变，但被 environment/rules 隔开了。优化方案：把 style 移到 identity 旁边。
3. **Cache 命中率的度量**：`cache_read_input_tokens / (cache_read_input_tokens + input_tokens)` = 命中率。目标 > 80%。

## 练习

1. 打印每次 API 响应的 `usage` 字段，计算 cache 命中率。
2. 故意把工具列表改为 `Math.random()` 排序，对比 cache 命中率的变化。
3. 研究 Claude Code `getCacheControl()` 中 `scope: 'global'` 的启用条件。
