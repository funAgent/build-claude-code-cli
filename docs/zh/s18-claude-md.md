# s18 — CLAUDE.md 项目规则：让 Agent 了解项目

> **Teach the agent your project's rules**

`[ Phase 4: Prompt 工程 ]` · 工具数: 9 · 代码量: ~300 行

---

## 前置知识

- 需要完成: s17 [System Prompt]

## 你将学到

- CLAUDE.md / RULES.md 项目规则文件的设计
- 三级加载优先级（全局 → 项目 → 子目录）
- 项目根检测（向上查找 package.json 或 .git）
- 规则文件注入 system prompt 的方式

s17 的 system prompt 告诉 Agent "你是谁"和"能做什么"，但不知道"这个项目怎么做"。比如：

- 项目用 ESM 还是 CJS？模型可能随意选择；
- 代码风格用 tabs 还是 spaces？模型用默认的；
- 项目有哪些约定（如"所有 API 放 src/api/"）？模型不知道。

Claude Code 的解决方案：**CLAUDE.md 项目规则文件**。用户写一份项目规则，Agent 自动加载。

## 设计决策

### 三级加载优先级

```
全局 — ~/.mycli/RULES.md     → 个人偏好（如"回复用中文"）
项目 — {root}/RULES.md        → 团队共享（如"用 ESM"）
子目录 — {cwd}/RULES.md       → 模块专属（如"这是测试目录"）
```

所有层级的规则**都会加载并合并**，而非覆盖。子目录规则补充项目规则。

### 项目根检测

从 cwd 向上查找 `package.json` 或 `.git`，第一个命中的目录即为项目根：

```typescript
function findProjectRoot(cwd: string): string {
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json")) || fs.existsSync(path.join(dir, ".git")))
      return dir;
    dir = path.dirname(dir);
  }
  return cwd;
}
```

### /init 命令

一键创建 RULES.md 模板，降低使用门槛。

## 实现要点

```typescript
export function loadRules(cwd: string): RuleFile[] {
  const rules: RuleFile[] = [];
  // 1. 全局: ~/.mycli/RULES.md
  // 2. 项目根: {root}/RULES.md
  // 3. 子目录: {cwd}/RULES.md（仅当 cwd !== root）
  return rules;
}
```

加载后用 `rulesToPromptSection()` 转为 prompt section，插在 environment 和 style 之间。

## 运行验证

```bash
cd agents/s18-claude-md
npm install
# 在当前目录创建 RULES.md
echo "- Always use TypeScript strict mode\n- Respond in Chinese" > RULES.md
npm run dev
# Agent 应遵循规则文件中的约定
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 规则文件 | RULES.md（单文件） | CLAUDE.md + .claude/CLAUDE.md + .claude/rules/*.md + CLAUDE.local.md |
| 加载层级 | 3 级 | 5+ 级（Managed + User + Project + Local + AutoMem + Team） |
| 解析 | 直接读文本 | Frontmatter + @include + HTML 注释剥离 |
| 初始化 | /init 模板 | `claude init` 命令 + AI 辅助生成 |

生产版的 `getMemoryFiles()` 从文件系统 root 到 cwd 逐级扫描，支持递归包含和条件规则。

## 深入思考

1. **为什么合并而非覆盖？** 全局规则 = 个人习惯，项目规则 = 团队约定，两者可以共存不冲突。
2. **CLAUDE.local.md 存在的意义？** 个人在项目里的偏好，不提交到 git（.gitignore）。
3. **规则文件的安全风险？** 恶意 RULES.md 可能注入"忽略之前的指令"——生产版需要检测 prompt injection。

## 练习

1. 创建 `~/.mycli/RULES.md`，写入"Always respond in English"，验证全局规则是否生效。
2. 实现 `--no-rules` 参数，跳过规则加载（用于调试）。
3. 给 `/init` 命令增加交互式生成——让 AI 分析当前项目结构后自动生成 RULES.md。

<details>
<summary>练习 1 参考实现</summary>

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** 全局规则：~/.mycli/RULES.md */
export function globalRulesPath(): string {
  return path.join(os.homedir(), ".mycli", "RULES.md");
}

export function readGlobalRules(): string | undefined {
  const p = globalRulesPath();
  if (!fs.existsSync(p)) return undefined;
  return fs.readFileSync(p, "utf8");
}
```

- **要点**：在 `~/.mycli/` 下新建 `RULES.md`，写入一行 `Always respond in English.`；确保 `loadRules` 把 `readGlobalRules()` 的结果并入 prompt。启动 CLI 后用中英混合提问，若回复为英文则全局规则生效。

</details>

<details>
<summary>练习 2 参考实现</summary>

```typescript
/** 解析 CLI，例如：node index.js --no-rules */
export function parseArgs(argv: string[]): { noRules: boolean; rest: string[] } {
  const noRules = argv.includes("--no-rules");
  const rest = argv.filter((a) => a !== "--no-rules");
  return { noRules, rest };
}

export function loadRules(cwd: string, opts: { skipRules?: boolean }): RuleFile[] {
  if (opts.skipRules) return [];
  const rules: RuleFile[] = [];
  // ... 与课文相同：合并 ~/.mycli、项目根、cwd 的 RULES.md ...
  return rules;
}
```

- **要点**：入口在解析出 `noRules` 后传入 `loadRules(cwd, { skipRules: noRules })`，调试时可完全跳过规则注入，避免干扰 prompt 对比。

</details>

<details>
<summary>练习 3 参考实现</summary>

```typescript
import fs from "node:fs";
import path from "node:path";

async function initRulesWithAi(cwd: string, client: AnthropicLike): Promise<void> {
  const summary = buildProjectSummary(cwd); // 如列出顶层目录、package.json 的 name/scripts
  const res = await client.messages.create({
    model: process.env.MODEL ?? "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are helping write RULES.md for this repo.\n\nProject snapshot:\n${summary}\n\nOutput only the RULES.md body in Markdown.`,
      },
    ],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const out = path.join(cwd, "RULES.md");
  fs.writeFileSync(out, text.trim() + "\n", "utf8");
}
```

- **要点**：`/init` 先收集结构化项目快照（避免把整个仓库塞进上下文），再调用一次非流式 `messages.create` 生成草稿并写入 `{cwd}/RULES.md`；用户可在写入后自行编辑确认。

</details>

## 下一课预告

每次 API 调用都发送完整 system prompt，大量重复 token 被计费。下一课 **s19 Prompt Cache** 将利用 Anthropic 的缓存机制，让重复的 prompt 前缀只计费一次。
