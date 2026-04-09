# s17 — 基础 System Prompt：告诉 Agent 它是谁

> **The system prompt is the agent's soul**

`[ Phase 4: Prompt 工程 ]` · 工具数: 9 · 代码量: ~250 行

---

## 前置知识

- 需要完成: s16 [REPL 主屏]

## 你将学到

- System prompt 的分层组装设计
- 工具指南自动生成——prompt 与实际工具同步
- 环境信息注入（OS、cwd、日期）
- Section 模式为后续 prompt cache 打基础

前 16 课里，system prompt 一直是一行硬编码字符串：

```typescript
const SYSTEM_PROMPT = "You are a helpful CLI assistant...";
```

这带来几个问题：

- **工具描述写死**：新增工具后 prompt 不会自动更新；
- **环境信息缺失**：模型不知道当前操作系统、工作目录、日期；
- **风格不可控**：想改输出风格要在一段大文本里找位置。

Claude Code 的 system prompt 有 **20+ 个结构化片段**，按层组装。

## 设计决策

### 分层组装 vs 单一模板

```
identity     → 你是谁、能做什么
tool-guide   → 有哪些工具、怎么用
environment  → 操作系统、目录、日期
style        → 输出格式、语气要求
```

每个 section 是独立函数，返回 `{ name, content }` 结构。好处：

- 新增 section 只需加一个函数
- 可以按需跳过某个 section
- 后续做 prompt cache 时可以标记哪些是 cacheable

### 工具指南自动生成

从 `ToolRegistry` 自动生成工具列表，确保 prompt 和实际可用工具始终同步：

```typescript
const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join("\n");
```

## 实现要点

```typescript
export function buildSystemPrompt(tools: Tool[], cwd: string): PromptSection[] {
  return [
    getIdentitySection(),
    getToolGuideSection(tools),
    getEnvironmentSection(cwd),
    getStyleSection(),
  ];
}
```

每个 section 函数独立维护自己的内容，最终用 `sectionsToString()` 拼接。

## 运行验证

```bash
cd agents/s17-system-prompt
npm install
npm run dev
# Agent 现在知道当前操作系统、工作目录和日期
# 输入"你知道哪些工具？" — 回复应与 /tools 列表一致
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| Section 数量 | 4 个 | 20+ 个（含 memory/language/output-style 等） |
| 组装方式 | 同步拼接 | 异步 section registry + memoize |
| 环境信息 | OS + cwd + date | + git 状态 + worktree + MCP |

生产版用 `resolveSystemPromptSections()` 异步解析，并将稳定 section 缓存在 bootstrap state 中。

## 深入思考

1. **为什么返回 Section[] 而不是 string？** 为后续 prompt cache 做准备——需要知道哪些是静态的、哪些是动态的。
2. **Section 顺序重要吗？** 是的。模型对前面的内容注意力更高（primacy effect），identity 放最前。
3. **工具指南放 system prompt 还是 user message？** System prompt——它是不变的上下文，不应每轮重复。

## 练习

1. 新增一个 `getGitSection()`，用 `git rev-parse --abbrev-ref HEAD` 注入当前分支名。
2. 实现一个 `--verbose-prompt` 参数，打印完整的 system prompt（调试用）。
3. 研究 Claude Code `constants/prompts.ts` 中的 `getUsingYourToolsSection`，比较与我们的 tool guide 区别。

<details>
<summary>练习 2 参考实现</summary>

在 `cli.ts` 中添加 `--verbose-prompt` 参数：

```typescript
program
  .command("chat")
  .option("--verbose-prompt", "打印完整 system prompt")
  .action(async (options) => {
    const config = loadConfig({ verbosePrompt: options.verbosePrompt });
    const tools = assembleToolPool();
    const sections = buildSystemPrompt(tools.getAll(), process.cwd());

    if (options.verbosePrompt) {
      console.log("=== System Prompt Sections ===");
      for (const section of sections) {
        console.log(`\n--- ${section.name} (cacheable: ${section.cacheable}) ---`);
        console.log(section.content);
      }
      console.log("\n=== End ===\n");
    }

    await startChat(config, sections);
  });
```

**用途**：调试 prompt 时可以检查每个 section 的内容是否正确，以及 cacheable 标记是否合理。

</details>

## 下一课预告

system prompt 告诉了 Agent "你是谁"，但它还不知道"这个项目怎么做"。下一课 **s18 CLAUDE.md** 将让 Agent 自动加载项目规则文件。
