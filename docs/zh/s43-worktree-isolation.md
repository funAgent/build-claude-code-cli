# s43 — Worktree 隔离：每个 Agent 独立目录

> **Git Worktree gives each agent a parallel world — no file conflicts, no commit chaos.**

`[ Phase 10: 多 Agent ]` · 工具数: 4 · 代码量: ~100 行

---

## 前置知识

- 需要完成: s42 Team Protocols：协商协议

## 你将学到

- <abbr data-tip="Git 原生功能，允许在同一仓库下创建多个工作目录，每个目录有独立分支，共享 .git 对象数据库，天然实现文件隔离">Git Worktree</abbr> 架构：每个 Agent 独立目录和分支的零冲突隔离
- Agent 工作流：createAgentWorktree → withAgentWorktree → 自动清理
- 清理策略：临时 slug 自动清理 vs 用户命名持久保留
- <abbr data-tip="Git 仓库的真正根目录（包含 .git 的目录），区别于 worktree 等子工作区，用于防止在嵌套目录中误创建子 worktree">Canonical root</abbr> 防护：避免在 worktree 中嵌套创建 worktree

## 问题场景

3 个 Worker Agent 同时修改代码。Worker-1 改了 `auth.ts`，Worker-2 也在改 `auth.ts`——冲突了。

```
共享目录的冲突：

  Worker-1: file_write("auth.ts", "版本 A")
  Worker-2: file_write("auth.ts", "版本 B")  ← 覆盖了 Worker-1 的工作！

  Worktree 隔离：

  Worker-1: cwd = .claude/worktrees/agent-abc/
            修改 auth.ts → 在分支 worktree-agent-abc 上

  Worker-2: cwd = .claude/worktrees/agent-def/
            修改 auth.ts → 在分支 worktree-agent-def 上

  两个 Agent 在不同目录、不同分支工作 → 零冲突
```

**Git Worktree 给每个 Agent 一个平行世界——文件不冲突，提交不混乱。**

## 设计决策

### Worktree 架构

```
Git Worktree 目录结构：

  my-project/                    ← 主仓库
  ├── .claude/
  │   └── worktrees/
  │       ├── agent-abc12345/    ← Worker 1 的工作区
  │       │   ├── src/
  │       │   └── .git           ← 指向主仓库
  │       └── agent-def67890/    ← Worker 2 的工作区
  │           ├── src/
  │           └── .git
  ├── src/                       ← 主工作区
  └── .git/
      └── worktrees/             ← Git 内部管理
```

### Agent 工作流

```
Agent + Worktree 完整流程：

  1. Agent 需要 worktree 隔离
     slug = agent-{agentId[:8]}
           ↓
  2. createAgentWorktree(slug)
     git worktree add -b worktree-agent-abc .claude/worktrees/agent-abc HEAD
           ↓
  3. Agent 在隔离目录下工作
     cwd = .claude/worktrees/agent-abc/
     → 读写文件、执行命令都在这个目录下
           ↓
  4. Agent 完成后检查
     hasWorktreeChanges()?
           ↓
     ┌─ 无更改 ──→ removeAgentWorktree() → 清理
     └─ 有更改 ──→ 保留供用户审查/合并
```

### 清理策略

```
临时 slug vs 用户命名：

  临时（自动清理）：         用户命名（保留）：
  agent-abc12345             feature-auth
  wf_task_1                  refactor-db
  bridge-xyz                 my-experiment
  job-build

  cleanupStaleWorktrees 只清理临时 slug
  用户通过 EnterWorktree 创建的命名目录不清理
```

## 实现

### 创建 Worktree

```typescript
export function createAgentWorktree(slug, cwd): WorktreeSession | null {
  const gitRoot = findGitRoot(cwd);
  const worktreePath = join(gitRoot, ".claude/worktrees", slug);
  const branch = `worktree-${slug}`;

  execSync(`git worktree add -b "${branch}" "${worktreePath}" HEAD`, { cwd: gitRoot });

  return { originalCwd: cwd, worktreePath, branch, agentSlug: slug };
}
```

### 完整工作流

```typescript
export function withAgentWorktree(agentId, cwd, fn) {
  const slug = `agent-${agentId.slice(0, 8)}`;
  const session = createAgentWorktree(slug, cwd);

  const result = fn(session.worktreePath);  // 在隔离目录执行
  const changes = hasWorktreeChanges(session.worktreePath);

  if (!changes) removeAgentWorktree(slug, cwd);  // 无更改则清理

  return { result, worktreePath: changes ? session.worktreePath : undefined, hasChanges: changes };
}
```

## 运行验证

```bash
cd agents/s43-worktree-isolation
npm run dev

# 1. 让 Agent 创建子 Agent 执行任务
#    > 帮我在隔离环境中重构 auth.ts

# 2. 观察 Worktree 创建
#    → [worktree] Created .claude/worktrees/agent-abc12345/
#    → [worktree] Branch: worktree-agent-abc12345
#    → Agent 在隔离目录中工作，主目录不受影响

# 3. 验证隔离性
ls .claude/worktrees/
# → 每个 Agent 有独立目录和分支

# 4. 观察清理行为
#    → 无更改的 worktree 自动清理
#    → 有更改的保留供用户审查
git worktree list
```

## 对照 Claude Code

| 维度 | 教学版 (s43) | Claude Code |
|------|-------------|-------------|
| Worktree 创建 | 基础 git worktree add | 同 + sparse-checkout + PR fetch |
| 路径 | .claude/worktrees/ | 同 |
| Agent 集成 | withAgentWorktree | AgentTool.tsx 内联 + runWithCwdOverride |
| 清理 | 前缀匹配 | 同 + 正则匹配 + canonical root |
| 会话级 | 无 | EnterWorktreeTool (用户主动进入) |
| 嵌套防护 | 无 | findCanonicalGitRoot 避免嵌套 |

## 深入思考

1. **Git Worktree 是天然隔离**：不需要 Docker、不需要虚拟机。Git 原生支持在同一仓库下创建多个工作目录，每个有独立分支。
2. **临时 vs 持久**：Agent 的 worktree 是临时的（无更改就删除）。用户创建的是持久的（明确命名，不自动删除）。
3. **Canonical root 防嵌套**：如果 Agent 已经在一个 worktree 里，`findCanonicalGitRoot` 会找到真正的主仓库，避免在 worktree 里再创建 worktree。

## 练习

1. 创建一个 worktree，在里面修改文件，观察主仓库不受影响
2. 实现 EnterWorktreeTool：用户主动进入命名 worktree

<details>
<summary>练习 2 参考实现</summary>

用户主动进入 worktree 的工具实现：

```typescript
export const enterWorktreeTool = buildTool({
  name: "worktree_enter",
  description: "切换到指定 worktree 工作目录...",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "worktree 名称" },
    },
    required: ["name"],
  },
  async call(input, context) {
    const worktreePath = join(findGitRoot(context.cwd), ".claude/worktrees", input.name);

    if (!existsSync(worktreePath)) {
      // 不存在则创建
      execSync(
        `git worktree add -b "wt-${input.name}" "${worktreePath}" HEAD`,
        { cwd: findGitRoot(context.cwd) },
      );
    }

    // 切换 Agent 的工作目录
    context.cwd = worktreePath;
    return { output: `已进入 worktree: ${input.name}\n路径: ${worktreePath}` };
  },
});
```

**持久化**：用户命名的 worktree（如 `feature-auth`）不会被 `cleanupStaleWorktrees` 清理，因为它不匹配 `agent-*` 前缀模式。

</details>

3. 添加 sparse-checkout 支持：只检出需要的文件，加速创建

## Phase 10 总结

恭喜完成 **多 Agent** 阶段！你现在掌握了：

- [x] s39 Agent 定义：声明式 Markdown 配置，四层来源合并
- [x] s40 Coordinator：Leader-Worker 编排，工具池分裂与并行调度
- [x] s41 Team + Mailbox：文件邮箱通信，零依赖 IPC
- [x] s42 Team Protocols：四种核心协商协议，结构化消息与权限同步
- [x] s43 Worktree 隔离：Git Worktree 天然隔离，零冲突并行

> 从单 Agent 到多 Agent 协作，你已具备构建团队级 AI 工程系统的能力。

## 下一课预告

**s44 — 递进式错误恢复**：进入 Phase 11——生产功能，从错误分类到熔断器的完整韧性体系。
