# s26 — 大输出处理：工具结果的预算与替换

> **Don't let one tool result eat the whole context.**

`[ Phase 6: 上下文管理 ]` · 工具数: 9 · 代码量: ~300 行

---

## 前置知识

- 需要完成: s25 [多层压缩策略]

## 你将学到

- 单工具结果大小限制与磁盘<abbr data-tip="将数据从内存写入磁盘文件，使其在程序重启后仍然存在">持久化</abbr>
- 预览替换格式：保留前 2000 字符预览
- 消息组<abbr data-tip="为单条 user 消息中所有 tool_result 设定的总大小上限，超出时自动替换最大的结果">预算</abbr>（per-message budget）与最大优先替换算法
- ContentReplacementState 保证 <abbr data-tip="API 服务端缓存已发送的 prompt 前缀，相同前缀的后续请求只需支付 cache read 费用（便宜 90%）">prompt cache</abbr> 稳定性

## 问题场景

用户让 Agent 读取一个大文件：

```
对话中的工具结果膨胀：

  messages 数组:
  ┌──────────────────────────────────────────────┐
  │ user: "读取 src/generated/schema.ts"          │  100 chars
  │ assistant: "好的，我来读取..."                 │  50 chars
  │ tool_use: file_read(schema.ts)                │  30 chars
  │ tool_result: "// 自动生成的类型定义\n          │
  │   export interface User {\n                   │
  │     id: string;\n                             │
  │     ...                                       │
  │   }\n                                         │
  │   // (10,000 行代码)"                         │  500,000 chars!
  └──────────────────────────────────────────────┘

  一个 tool_result 就占了 ~125,000 tokens
  → 单条消息就用掉了 60% 的 context window
```

如果连续读取几个大文件，context window 在第一轮就用尽了。**工具结果可能比对话本身还大。**

## 设计决策

### 两道防线

```
工具结果的两道防线：

  防线 1: 单结果大小限制                          防线 2: 消息组预算
  ┌────────────────────────────┐                ┌────────────────────────────┐
  │                            │                │                            │
  │  工具返回结果               │                │  一条 user 消息中的         │
  │       ↓                    │                │  所有 tool_result 加起来     │
  │  > 50K chars ?             │                │       ↓                    │
  │  ├─ No → 直接放入 messages │                │  > 200K chars ?            │
  │  └─ Yes → 持久化到磁盘     │                │  ├─ No → 正常              │
  │          → messages 中只    │                │  └─ Yes → 最大优先替换     │
  │            保留预览         │                │          直到回到预算内     │
  │                            │                │                            │
  └────────────────────────────┘                └────────────────────────────┘
```

### 持久化 vs 截断

```
方案对比：

  方案 A: 直接截断大输出
  ┌──────────────────────────────────────────┐
  │  ✗ 模型无法引用完整内容                   │
  │  ✗ 截断位置可能砍断关键信息               │
  │  ✗ 后续工具无法读取完整结果               │
  └──────────────────────────────────────────┘

  方案 B: 持久化到磁盘 + 预览替换              ← 选择
  ┌──────────────────────────────────────────┐
  │  ✓ 完整内容保存在磁盘                     │
  │  ✓ 模型看到前 2000 字符的预览             │
  │  ✓ 需要时可以重新读取                     │
  │  ✓ 同一结果多次引用不会重复占空间         │
  └──────────────────────────────────────────┘
```

### 预览替换格式

```
原始 tool_result (500K chars):
  "// 自动生成的类型定义\nexport interface User {\n..."

替换为 (2K chars):
  <persisted_tool_result>
  路径: .agent-sessions/abc123/tool-results/toolu_456.txt
  总大小: 500000 字符

  预览 (前 2000 字符):
  // 自动生成的类型定义
  export interface User {
    id: string;
    name: string;
    ...

  ... (内容已截断，完整内容保存在磁盘)
  </persisted_tool_result>
```

## 实现

### 单结果持久化

```typescript
const MAX_RESULT_SIZE_CHARS = 50_000;
const PREVIEW_SIZE = 2_000;

export function processToolResult(
  toolUseId: string,
  content: string,
  sessionDir: string,
): { content: string; persisted: boolean } {
  if (content.length <= MAX_RESULT_SIZE_CHARS) {
    return { content, persisted: false };
  }

  // 写入磁盘
  const filePath = persistToolResult(toolUseId, content, sessionDir);
  // 生成预览
  const replacement = buildLargeToolResultMessage(filePath, content);

  return { content: replacement, persisted: true };
}
```

### 预算控制

```typescript
const PER_MESSAGE_BUDGET_CHARS = 200_000;

export function applyToolResultBudget(
  messages, state, sessionDir
): { replacedCount: number } {
  for (const msg of messages) {
    if (msg.role !== "user") continue;

    let totalChars = sumToolResultChars(msg);

    if (totalChars > PER_MESSAGE_BUDGET_CHARS) {
      // 最大优先选择替换候选
      const candidates = getCandidatesSortedBySize(msg);

      for (const candidate of candidates) {
        if (totalChars <= PER_MESSAGE_BUDGET_CHARS) break;
        persistAndReplace(candidate, state, sessionDir);
        totalChars -= (candidate.size - replacementSize);
      }
    }
  }
}
```

关键点：**最大优先 (largest-first)**。每次替换最大的工具结果，用最少的替换次数回到预算内。

### Content Replacement State

```typescript
export interface ContentReplacementState {
  seenIds: Set<string>;          // 已处理的 tool_use_id
  replacements: Map<string, string>;  // id → 替换内容
}
```

为什么需要这个状态？API 可能重试（网络错误），同一条消息会再次发送。`ContentReplacementState` 确保同一个工具结果始终用相同的替换内容——这是 prompt cache 命中的关键。

### Agent 集成

```typescript
// agent.ts — 工具结果返回时
const processed = processToolResult(
  tr.id, tr.result.output, this.sessionDir
);
// processed.persisted === true → 已写入磁盘

// 发送 API 前
this.applyBudget(onOutput);  // 确保不超预算
```

## 运行验证

```bash
cd agents/s26-tool-result-budget

# 启动 Agent
npm run dev

# 让 Agent 读取一个大文件
> 读取 node_modules/typescript/lib/typescript.d.ts

# 观察：
# 1. 大文件被持久化到 .agent-sessions/xxx/tool-results/
# 2. messages 中只有前 2000 字符的预览
# 3. context window 使用量显著降低
```

## 对照 Claude Code

| 维度 | 教学版 (s26) | Claude Code |
|------|-------------|-------------|
| 单结果阈值 | `50K` chars 硬编码 | `DEFAULT_MAX_RESULT_SIZE_CHARS = 50K` + GrowthBook per-tool 覆盖 |
| 消息预算 | `200K` chars 硬编码 | `MAX_TOOL_RESULTS_PER_MESSAGE_CHARS = 200K` + GrowthBook `tengu_hawthorn_window` 覆盖 |
| 存储路径 | `.agent-sessions/{id}/tool-results/` | `{projectDir}/{sessionId}/tool-results/` |
| 文件格式 | `.txt` | `.json` 或 `.txt`（按内容类型） |
| 预览大小 | 2000 chars | `PREVIEW_SIZE_BYTES = 2000` |
| 跳过工具 | 无 | `skipToolNames`（如 file_read 用 `Infinity`，不持久化） |
| Feature gate | 无 | `tengu_hawthorn_steeple` 门控 `provisionContentReplacementState` |
| Cache stability | `ContentReplacementState` 基础实现 | 完整的 `mustReapply` / `frozen` / `fresh` 分类 |

**Claude Code 的工具结果管理架构**：

```
工具返回结果
  │
  ├── processToolResultBlock()
  │     ├── getPersistenceThreshold(toolName)
  │     │     └── per-tool 阈值 (GrowthBook 覆盖)
  │     ├── content.length > threshold ?
  │     │     ├── Yes → persistToolResult() + buildLargeToolResultMessage()
  │     │     └── No → 原样保留
  │     └── 返回处理后的 content
  │
  └── applyToolResultBudget(messages, state)
        ├── enforceToolResultBudget()
        │     ├── 按 API-level user message groups 分组
        │     ├── 分类: mustReapply / frozen / fresh
        │     ├── totalChars > PER_MESSAGE_BUDGET ?
        │     │     └── selectFreshToReplace (largest-first)
        │     └── buildReplacement → persistToolResult
        │
        └── 更新 state.seenIds + state.replacements
              → 确保 cache-stable replay
```

生产版最精妙的设计是 `mustReapply` / `frozen` / `fresh` 三分类：
- **mustReapply**: 之前已替换的，必须用缓存的替换内容（cache stability）
- **frozen**: 已见但未替换的，不再处理
- **fresh**: 新出现的，候选替换

## 深入思考

1. **预算 vs 精确**：200K chars 的预算是粗略的（不考虑 XML 标签开销、工具名等）。但粗略预算 + 安全余量比精确计算更可靠，且性能更好。
2. **磁盘 I/O 的成本**：每次持久化都有文件写入。`flag: 'wx'` 确保幂等——如果文件已存在，不会重写。这避免了重试场景下的重复 I/O。
3. **预览的价值**：前 2000 字符通常包含文件的 imports 和前几个定义，这往往足够模型理解文件结构。如果模型需要更多细节，它可以再次调用 file_read 读取特定片段。

## 练习

1. 修改 `MAX_RESULT_SIZE_CHARS` 为 5000，用 Agent 读取一个中等大小的文件，观察持久化行为

<details>
<summary>练习 1 参考实现</summary>

调整单结果阈值观察持久化：

```typescript
const MAX_RESULT_SIZE_CHARS = 5_000; // 从 50K 降到 5K（测试用）
```

然后让 Agent 读取一个超过 5K 字符的文件（如 package-lock.json）：

```
> 读取 package-lock.json
```

**预期观察**：
1. 文件内容超过 5000 字符
2. 完整内容被写入 `.agent-sessions/{id}/tool-results/toolu_xxx.txt`
3. messages 中只保留前 2000 字符预览 + 磁盘路径
4. 如果 Agent 需要查看完整内容，它可以调用 file_read 读取持久化路径

</details>
2. 实现 `readPersistedResult(toolUseId)`：让模型可以通过工具调用重新读取完整的持久化内容
3. 添加清理机制：会话结束时删除 `.agent-sessions` 目录

## Phase 6 总结

恭喜！完成 s24-s26，你的 Agent 已经有了**完整的上下文管理能力**：

- ✅ 自动压缩：用摘要替换历史，保留记忆骨架（s24）
- ✅ 多层压缩策略：微压缩 + 自动压缩 + 响应式压缩 + 熔断（s25）
- ✅ 工具结果预算：持久化大输出，预览替换 + 最大优先清理（s26）

下一个 Phase 将让 Agent 从"被动执行"进化为"主动思考"。Agent 如何规划任务？如何创建子 Agent？**s27 TodoWrite** 开始。

## 下一课预告

Agent 拿到一个复杂任务时，如果没有规划，就会混乱执行。下一课 **s27 TodoWrite** 将实现任务规划工具，让 Agent 先拆解任务、再逐项执行。
