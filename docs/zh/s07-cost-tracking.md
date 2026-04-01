# s07 — 成本追踪

> **If you can't measure it, you can't manage it**

`[ Phase 1: 最小 Agent ]` · 工具数: 1 · 代码量: ~150 行

---

## 前置知识

- 需要完成: s06 [配置管理]

## 你将学到

- API 响应中 `usage` 字段的结构和含义
- 如何累加 token 消耗并按模型定价计算成本
- 实时成本显示的设计——每条回复附带成本信息
- 为什么成本透明是 AI 产品的基本要求

## 问题场景

Agent 跑起来了，错误也处理了，配置也灵活了。但有一个关键问题被忽略了——**你不知道每次对话花了多少钱**。

AI API 按 token 计费。一次复杂的多轮对话可能花费 $0.01，也可能花费 $1。没有成本可见性，用户不知道自己在"烧钱"。

## 设计决策

### 计费粒度

| 方案 | 优点 | 缺点 |
|------|------|------|
| 仅累计总量 | 最简单 | 用户不知道哪步最贵 |
| 每轮显示 | 用户实时知道成本 | 输出稍显嘈杂 |
| 分项统计 | 最透明 | 实现复杂 |

我们选择每轮行内显示 + `/cost` 详细统计。Claude Code 在状态栏持续显示累计成本。

## 动手实现

### 步骤 1: CostTracker 类

核心逻辑——累加 usage 并按模型定价计算：

```typescript
class CostTracker {
  addUsage(usage: { input_tokens: number; output_tokens: number }): void {
    this.totalInputTokens += usage.input_tokens;
    this.totalOutputTokens += usage.output_tokens;
    this.apiCalls++;
  }

  getCost(): { inputCost: number; outputCost: number; totalCost: number } {
    const pricing = PRICING[this.model];
    return {
      inputCost: (this.totalInputTokens / 1_000_000) * pricing.inputPerMillion,
      outputCost: (this.totalOutputTokens / 1_000_000) * pricing.outputPerMillion,
      // ...
    };
  }
}
```

> 完整实现（含模型定价表）见 **Code** 标签页

### 步骤 2: 集成到 Agent 循环

在每次 API 调用后，把 `response.usage` 传给 tracker：

```typescript
this.tracker.addUsage(response.usage);
console.log(`  ${this.tracker.getInlineStatus()}`);
// 输出: [1200↓ 280↑ $0.0078]
```

## 运行验证

```bash
npm run dev "帮我看看当前目录结构"  # 观察每轮成本
npm run dev                          # 交互式，输入 /cost 查看详情
```

> 点击 **Simulate** 标签页查看成本累加的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| Token 计数 | 手动累加 usage | 全局 state 自动累加 |
| 成本显示 | 行内 + /cost 命令 | 状态栏持续显示 |
| 定价表 | 硬编码 3 个模型 | API 动态获取 |
| 预算控制 | 无 | token 预算触发自动压缩 |

> 更详细的架构对照见 **Deep Dive** 标签页

## 深入思考

**Q: 为什么输入 token 比输出 token 便宜？**

A: 输入 token 已经在 prompt 中了，模型只需要"理解"；输出 token 需要模型"生成"，计算量更大。Claude Sonnet 的输入价格 $3/M，输出 $15/M，差 5 倍。

**Q: Claude Code 怎么控制成本不爆炸？**

A: 通过 token 预算（budget）。当累计消耗接近预算时，自动触发上下文压缩（s24 课），而不是停止服务。这比简单的 MAX_TURNS 更智能。

## 动手练习

1. 添加缓存 token 统计（response.usage.cache_creation_input_tokens / cache_read_input_tokens）
2. 实现成本预警：当单次对话超过 $0.10 时自动提示用户
3. 把成本数据持久化到文件，实现跨会话的历史成本追踪

## Phase 1 总结

恭喜！完成 s03-s07，你已经构建了一个**最小但完整的 AI Agent**：
- ✅ 核心循环（s03）
- ✅ 消息管理（s04）
- ✅ 错误处理（s05）
- ✅ 配置管理（s06）
- ✅ 成本追踪（s07）

下一个 Phase 将把这个 Agent 的"工具"从 1 个扩展到完整的工具系统——**s08 Tool 抽象**开始。
