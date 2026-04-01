# s39 — Agent 定义：声明式配置

## 问题场景

你想创建一个专注于代码审查的 Agent，一个专注于测试的 Agent。每次都要改代码？

```
硬编码 Agent 的痛点：

  // 想加一个新 Agent？改代码、重新编译、重新发布
  if (agentType === "coder") { ... }
  if (agentType === "reviewer") { ... }
  if (agentType === "tester") { ... }  // 又要改代码

  声明式配置：
  .agents/
  ├── reviewer.md    ← 用户放一个文件就行
  ├── tester.md      ← 零代码扩展
  └── security.md
```

**Agents should be configured, not hardcoded.**

## 设计决策

### Agent 定义格式

```
Markdown Agent 文件格式：

  ---
  agentType: security-reviewer
  whenToUse: 安全审查和漏洞分析
  tools: file_read, grep, bash
  model: claude-sonnet
  maxTurns: 10
  ---

  你是一个安全审查专家。分析代码中的安全漏洞，
  包括但不限于：SQL 注入、XSS、权限绕过。
  不要修改代码，只提供审查报告。
```

### 多来源合并

```
Agent 来源优先级（后者覆盖前者）：

  built-in:  coder, reviewer     ← 内置
  plugin:    lint-agent           ← 插件提供
  user:      ~/.agent-cli/agents/ ← 用户全局
  project:   .agents/             ← 项目级

  同名 Agent 按优先级覆盖：
  project > user > plugin > built-in
```

## 实现

### AgentDefinition 类型

```typescript
export interface AgentDefinition {
  agentType: string;        // 唯一标识
  whenToUse: string;        // 描述何时使用
  systemPrompt: string;     // 系统提示词
  tools?: string[];         // 允许的工具
  disallowedTools?: string[];
  model?: string;
  maxTurns?: number;
  source: AgentSource;      // 来源
  isolation?: "none" | "worktree";
}
```

### Markdown 解析

```typescript
export function parseAgentFromMarkdown(content, source): AgentDefinition | null {
  // 解析 frontmatter (---...---) + body
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  // frontmatter 提取字段，body 作为 systemPrompt
}
```

## 对照 Claude Code

| 维度 | 教学版 (s39) | Claude Code |
|------|-------------|-------------|
| 类型 | 统一 AgentDefinition | 联合类型 (BuiltIn/Custom/Plugin) |
| 解析 | 简单 frontmatter | parseAgentFromMarkdown + AgentJsonSchema |
| 来源 | 4 层 | 7 层 (+ flag/managed/local) |
| 合并 | Map 覆盖 | 分组排序 + 同名覆盖 + shadowed 标记 |
| 子命令 | 简单列表 | `claude agents` 分组展示 + shadowed 提示 |

## 深入思考

1. **配置即代码**：Markdown 是最好的 Agent 配置格式——frontmatter 定义元数据，body 是自由的系统提示词。
2. **来源优先级**：项目级覆盖用户级，让团队共享 Agent 定义时个人配置不影响团队。
3. **零代码扩展**：用户不需要懂 TypeScript——放一个 `.md` 文件就能创建新 Agent。

## 练习

1. 创建 `.agents/` 目录，定义一个 "test-writer" Agent
2. 实现 JSON 格式的 Agent 定义（parseAgentFromJson）
3. 添加 shadowed 检测：当高优先级覆盖低优先级时提示用户
