# s11 — 搜索工具：先找到再修改

> **Find first, edit second**

`[ Phase 2: 工具系统 ]` · 工具数: 6 · 代码量: ~250 行

---

## 前置知识

- 需要完成: s10 [编辑工具]

## 你将学到

- GlobTool：按路径模式枚举文件
- GrepTool：按内容正则搜索文件
- 搜索结果的截断策略——保护上下文长度
- 为什么搜索要成为一等工具而不是用 bash 封装

## 问题场景

Agent 不知道仓库里有哪些文件、某符号在哪里出现时，只能盲目 `bash` 或整目录 `file_read`，又慢又费 token。

**典型工作流**：先 **定位**（哪些路径 / 哪些行），再 **精读**（`file_read`），最后 **小步编辑**（`file_edit`）。
搜索类工具就是这条链路的「前哨」。

### 与 Bash 分工

| 做法 | 风险 / 成本 |
|------|-------------|
| `bash` + `find` / `grep` | 输出格式不稳定，难截断，易把巨量 stdout 塞进上下文 |
| 专用 `glob` / `grep` 工具 | 返回结构化、可限额文本，便于系统提示约束行为 |

因此 s11 不是「再封装一层 shell」，而是把**最高频的探索动作**变成一等 API。

## 设计决策

### GlobTool：按路径模式枚举

- 输入 `pattern`（如 `**/*.ts`）、可选根目录 `path`。
- 输出匹配文件的相对路径列表；教学版用目录遍历 + 简化 <abbr data-tip="文件路径匹配模式，** 表示任意层目录，* 表示任意文件名。例如 **/*.ts 匹配所有目录下的 .ts 文件。">glob</abbr> 匹配，忽略点目录与 `node_modules`。

### GrepTool：按内容正则搜索

- 输入 `pattern`（正则）、可选路径、`include` 扩展名过滤。
- 输出 `相对路径:行号: 内容`，便于直接跳转到 `file_read` / `file_edit`。

### 为什么要单独成工具？

比封装 `bash` 更**稳定、可截断、可审计**；系统提示里可明确「先 glob/grep 再改」。

## 实现要点

- **Glob**：递归收集文件 → 按模式过滤 → 结果过多时**截断**（如最多展示 200 条并标明）。
- **Grep**：遍历候选文件 → 每行跑正则 → 总匹配数超限时**提前停止**并截断输出（教学版示例为 500）。

```typescript
const MAX_RESULTS = 200;
const header = `找到 ${matched.length} 个文件${truncated ? ` (显示前 ${MAX_RESULTS} 个)` : ""}`;
```

这样既保护上下文长度，又给模型明确信号：需要缩小模式或增加目录约束。

## 运行验证

```bash
cd agents/s11-search-tools
npm install
cp .env.example .env
npm run dev "用 glob 找所有 ts 文件，再用 grep 搜索 buildTool"
```

观察输出是否在大量匹配时被截断并提示。

可再试：在包含 `node_modules` 的目录下搜索——教学版会跳过该目录，结果应与「直接 grep 整个目录」不同，这是**刻意**的噪声控制。

## 对照 Claude Code

| 点 | 教学版 | Claude Code |
|----|--------|-------------|
| 文件枚举 | Node 递归 + 简化 glob | 常基于 <abbr data-tip="ripgrep 的简称，一个用 Rust 编写的高性能文本搜索工具，比传统 grep 快 10-100 倍，且默认尊重 .gitignore 规则。">ripgrep</abbr> `--files`，性能更好 |
| 内容搜索 | 逐文件读入 + RegExp | **rg** 子进程，选项更丰富 |
| 忽略规则 | 简单跳过 dot / node_modules | 尊重 `.gitignore` 等 |

我们先用纯 Node 讲清语义；上生产时再换 rg 不改变工具对模型的接口形状。

## 深入思考

1. **搜索是否应标为只读？** 是——便于 s12 在只读模式下仍允许「先搜再决定」。
2. **正则默认大小写**：教学版使用 `i` 标志；产品上要明确文档，避免与用户预期不符。
3. **最常用工具**：统计上 glob/grep 调用频率往往高于单次大文件 `file_read`——因为「找」比「读全文」更先发生。
4. **截断与诚实性**：header 应报告**真实**匹配总数（或「至少 N」），避免模型误以为「只有这些结果」。

## 练习

1. 给 `grep` 增加可选 `maxMatches` 参数并在输出中写明截断原因（对齐 glob 的 `MAX_RESULTS` 风格）。
2. 实现一个仅搜索 `git ls-files` 列出文件的「仓库内 glob」，对比速度与误扫（可选：仅思考伪代码）。
3. 阅读 Claude Code `GrepTool` 生产实现，列出三条切换到 ripgrep 时必须处理的 CLI 细节（如 `.gitignore`、二进制检测）。
4. 讨论：若仓库含 10MB 单文件日志，当前逐行 grep 会有何风险？可如何缓解（不要求实现）？

<details>
<summary>练习 1 参考实现</summary>

给 GrepTool 添加 `maxMatches` 参数：

```typescript
const grepTool = buildTool({
  name: "grep",
  description: "Search file contents with regex pattern.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pattern: { type: "string", description: "Regex pattern" },
      path: { type: "string", description: "Root directory" },
      include: { type: "string", description: "File extension filter, e.g. '.ts'" },
      maxMatches: { type: "number", description: "Max results (default 500)" },
    },
    required: ["pattern"],
  },
  call: async (input) => {
    const maxMatches = (input.maxMatches as number) ?? 500;
    // ... 搜索逻辑 ...
    const truncated = matches.length > maxMatches;
    const shown = matches.slice(0, maxMatches);
    const header = truncated
      ? `找到 ${matches.length} 处匹配 (显示前 ${maxMatches} 处，请缩小 pattern 或添加 include 过滤)`
      : `找到 ${matches.length} 处匹配`;
    return { output: header + "\n" + shown.join("\n"), exitCode: 0 };
  },
});
```

**要点**：即使截断也要报告真实总数，让模型知道还有更多结果可以缩小范围来获取。

</details>

## 下一课预告

工具多了，管理就成了问题。下一课 **s12 工具注册表** 将实现统一的 `ToolRegistry`，让工具注册、过滤、排序变得有条理——还能支持只读模式和 prompt cache 优化。
