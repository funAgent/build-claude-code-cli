# s30 — Skill 系统：按需加载知识

> **Load knowledge when you need it, not upfront.**

`[ Phase 7: Agent 智能 ]` · 工具数: 12 · 代码量: ~300 行

---

## 前置知识

- 需要完成: s29 [Subagent 进阶]

## 你将学到

- SKILL.md 文件发现与解析
- <abbr data-tip="将外部知识（如文档、规范）动态传递给模型的过程，区别于硬编码在 system prompt 中的静态知识">知识注入</abbr>通过 tool_result 而非 system prompt
- <abbr data-tip="不在 system prompt 初始列表中声明的工具，Agent 通过 tool_search 按需发现后才可使用，节省 prompt 空间">延迟工具</abbr>（deferred tools）与 ToolSearchTool
- inline / fork / remote 三种技能加载模式

## 问题场景

你的 Agent 需要了解项目的部署流程、编码规范、API 设计指南。如果把所有知识都放在 system prompt 里：

```
System Prompt 膨胀：

  身份定义 (200 tokens)
  工具列表 (2000 tokens)
  环境信息 (500 tokens)
  编码规范 (3000 tokens)     ← 每次对话都传
  部署流程 (2000 tokens)     ← 很少用到
  API 指南 (4000 tokens)     ← 偶尔需要
  ─────────────────────
  总计: ~12K tokens

  问题: 部署流程和 API 指南在大多数对话中根本用不到
        但每次 API 调用都要传 12K tokens → 浪费成本
```

**Load knowledge when you need it, not upfront.**

## 设计决策

### 知识注入方式

```
方案对比：

  方案 A: System Prompt 注入
  ┌──────────────────────────────────────┐
  │  所有知识 → system prompt            │
  │  ✗ 每次 API 都传，浪费 token         │
  │  ✗ system prompt 膨胀               │
  │  ✓ 模型始终可见                      │
  └──────────────────────────────────────┘

  方案 B: Tool Result 注入                ← 选择
  ┌──────────────────────────────────────┐
  │  Agent 调用 skill("部署") → 内容注入  │
  │  ✓ 按需加载，不用时不消耗 token       │
  │  ✓ system prompt 保持精简            │
  │  ✓ 可以在需要时重复加载              │
  └──────────────────────────────────────┘
```

### SKILL.md 文件结构

```
项目目录结构：

  project/
  ├── .skills/
  │   ├── deploy/
  │   │   └── SKILL.md        ← 部署流程指南
  │   ├── code-review/
  │   │   └── SKILL.md        ← 代码审查规范
  │   └── api-design/
  │       └── SKILL.md        ← API 设计指南
  ├── SKILL.md                ← 项目级技能
  └── src/
```

### 延迟工具 (Deferred Tools)

```
工具加载策略：

  初始加载（在 system prompt 中）:
  ┌──────────────────────────────────────┐
  │ glob  grep  ls  file_read  bash     │
  │ file_write  file_edit  todo_write   │
  │ agent  skill  tool_search           │
  │                                      │
  │ → Agent 总是知道这些工具存在         │
  └──────────────────────────────────────┘

  延迟加载（通过 tool_search 发现）:
  ┌──────────────────────────────────────┐
  │ web_search  web_fetch  ...           │
  │ mcp__database  mcp__github  ...      │
  │                                      │
  │ → 不在初始 prompt 中                 │
  │ → Agent 通过 tool_search 按需发现    │
  └──────────────────────────────────────┘
```

## 实现

### SKILL.md 发现

```typescript
export function discoverSkills(projectRoot: string): Skill[] {
  const skills: Skill[] = [];

  // 扫描 .skills/ 子目录
  const skillsDir = join(projectRoot, ".skills");
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillFile = join(skillsDir, entry.name, "SKILL.md");
      if (existsSync(skillFile)) {
        skills.push(parseSkillFile(readFileSync(skillFile, "utf-8")));
      }
    }
  }

  return skills;
}
```

### SkillTool

```typescript
export const skillTool = buildTool({
  name: "skill",
  description: "加载技能（SKILL.md）获取专业知识...",
  async call(input, context) {
    const skills = discoverSkills(context.cwd);
    const skill = findSkill(skills, input.name);

    // 通过 tool_result 注入知识
    return {
      output: `已加载技能: ${skill.name}\n\n${skill.content}`,
    };
  },
});
```

### ToolSearchTool

```typescript
export const toolSearchTool = buildTool({
  name: "tool_search",
  description: "搜索可用工具...",
  async call(input) {
    const matches = deferredTools.filter(
      tool => tool.name.includes(query) || tool.description.includes(query)
    );
    return { output: formatMatches(matches) };
  },
});
```

## 运行验证

```bash
cd agents/s30-skill-system

# 创建一个技能文件
mkdir -p .skills/deploy
echo "# 部署流程\n使用 Docker Compose 部署..." > .skills/deploy/SKILL.md

npm run dev
> 加载部署技能
# Agent 会调用 skill("deploy") 加载 SKILL.md 内容
```

## 对照 Claude Code

| 维度 | 教学版 (s30) | Claude Code |
|------|-------------|-------------|
| Skill 来源 | `.skills/` 目录 + 项目根 SKILL.md | `~/.claude/skills/` + 项目 `.cursor/skills/` + MCP prompt skills |
| 文件格式 | 纯 Markdown | YAML frontmatter + Markdown body（`parseFrontmatter`） |
| 加载模式 | inline（直接注入） | inline + fork（子 Agent 执行）+ remote（远程加载） |
| ToolSearch | 简单关键词搜索 | `parseToolName` + `+required` 术语 + 名称/hint 打分 + `select:` 直选 |
| Deferred Tools | 概念介绍 | `isDeferredTool` 标记 + tool_search 只搜 deferred 工具 |
| 返回格式 | 文本 | `tool_reference` blocks（API 原生引用） |

## 深入思考

1. **知识注入通过 tool_result**：这是一个精妙的设计。system prompt 是全局的（每次 API 调用都传），tool_result 是局部的（只在这一轮对话中出现）。按需注入节省的 token 成本在长对话中非常显著。
2. **SKILL.md 是知识的标准化**：与其把知识散落在注释、文档、wiki 中，不如用 SKILL.md 集中管理。Agent 可以像人类查阅手册一样查阅 SKILL.md。
3. **Deferred Tools 与 Prompt Cache**：如果把 100 个 MCP 工具都放在 system prompt 中，prompt cache 命中率会很高（因为 tools 不变），但初始 prompt 会很大。延迟加载是一种取舍：用 cache 效率换 prompt 大小。

## 练习

1. 创建 3 个不同的 SKILL.md（编码规范、Git 工作流、测试指南），观察 Agent 如何选择性加载
2. 实现 fork 模式：加载 SKILL.md 后用子 Agent 执行其中的指令

<details>
<summary>练习 2 参考实现</summary>

Fork 模式的 SkillTool 实现：

```typescript
export const skillTool = buildTool({
  name: "skill",
  description: "加载技能获取专业知识...",
  async call(input, context) {
    const skills = discoverSkills(context.cwd);
    const skill = findSkill(skills, input.name);

    if (skill.mode === "fork") {
      // fork 模式：启动子 Agent 执行技能指令
      const subContext = createSubagentContext({
        parentAgentId: context.agentId,
        parentCwd: context.cwd,
        parentAbortController: context.abortController,
      });

      const result = await runSubagentLoop(
        subContext,
        `执行技能 "${skill.name}" 的指令：\n\n${skill.content}`,
      );
      return { output: result };
    }

    // inline 模式：直接注入知识到当前上下文
    return {
      output: `已加载技能: ${skill.name}\n\n${skill.content}`,
    };
  },
});
```

**SKILL.md 中声明模式**：在文件头部加 `<!-- mode: fork -->` 或使用 YAML frontmatter `{ mode: "fork" }`。

</details>
3. 为 ToolSearchTool 添加模糊搜索和相关性评分

## 下一课预告

TodoWrite 让 Agent 学会了规划，但它只有内存存储、没有依赖关系。下一课 **s31 Task System** 将实现磁盘持久化的任务管理——依赖图、拓扑排序、多 Agent 协作，让大型项目的任务协调成为可能。
