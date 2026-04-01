# s32 — 权限规则引擎：allow / deny / ask

## 问题场景

你的 Agent 有 `bash` 工具。用户说："帮我清理临时文件。"

Agent 可能执行的命令：

```
毫无限制的 Agent：

  用户: "清理临时文件"
       ↓
  Agent: bash({command: "rm -rf /tmp/*"})
       ↓
  ??? 如果 Agent 理解错了呢？
  ??? 如果它执行 rm -rf / 呢？

  没有权限控制 = 给 AI 无限制的 root 权限
```

**Security is not one check; it's layered defense.**

## 设计决策

### 权限行为

```
三种权限行为：

  allow  ✓ 直接放行，不打断用户
  deny   ✗ 直接拒绝，不执行
  ask    ? 暂停执行，询问用户确认

  默认行为：
  • 只读工具（grep, ls, file_read）→ allow
  • 写操作工具（file_write, bash）  → ask
  • 危险操作（rm -rf /）            → deny
```

### 权限模式

```
四种全局安全级别：

  default           标准模式
  ├── 按规则决定 allow/deny/ask
  └── 未匹配规则的写操作 → ask

  acceptEdits       自动批准编辑
  ├── file_write / file_edit → 自动 allow
  └── bash → 仍然 ask

  bypassPermissions 跳过大部分检查
  ├── 大范围放行
  └── 但仍受 safety check 和内容级 ask 约束

  dontAsk           不询问
  ├── 所有 ask → 自动变 deny
  └── 适用于 CI/CD 等非交互环境
```

### 决策流水线

```
hasPermissionsToUseTool 的决策顺序：

  工具调用 (toolName, input)
       ↓
  ① 整工具 deny 规则?    ──→ deny
       ↓ 否
  ② 整工具 ask 规则?     ──→ ask
       ↓ 否
  ③ tool.checkPermissions ──→ 工具自定义检查
       ↓ allow
  ④ 内容级 deny/ask?     ──→ 即使 bypass 也拦截
       ↓ 否
  ⑤ bypass 模式?         ──→ allow
       ↓ 否
  ⑥ acceptEdits?         ──→ 编辑工具 allow
       ↓ 否
  ⑦ 整工具 allow 规则?   ──→ allow
       ↓ 否
  ⑧ 只读工具?            ──→ allow
       ↓ 否
  ⑨ 默认                 ──→ ask
```

### 规则结构

```
权限规则的三要素：

  PermissionRule = {
    source:   "session",       ← 来自哪里
    behavior: "allow",         ← 做什么
    value: {
      toolName: "bash",        ← 匹配哪个工具
      ruleContent: "npm test"  ← 匹配什么内容（可选）
    }
  }

  整工具规则（ruleContent 为空）:
    { toolName: "bash", behavior: "deny" }
    → 禁止所有 bash 命令

  内容级规则:
    { toolName: "bash", ruleContent: "npm test", behavior: "allow" }
    → 只允许 bash 执行 npm test
```

## 实现

### 权限检查主入口

```typescript
export function hasPermissionsToUseTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: PermissionContext,
  toolPermissionCheck?: ToolPermissionCheck,
): PermissionDecision {
  // Step 1: deny 规则（最高优先级）
  const denyRule = findMatchingRule(toolName, ctx.denyRules);
  if (denyRule) return { behavior: "deny", rule: denyRule };

  // Step 2: ask 规则
  const askRule = findMatchingRule(toolName, ctx.askRules);
  if (askRule) return { behavior: "ask", rule: askRule };

  // Step 3: 工具自定义检查
  if (toolPermissionCheck) {
    const decision = toolPermissionCheck(input);
    if (decision.behavior !== "allow") return decision;
  }

  // Step 5: bypass → allow
  if (ctx.mode === "bypassPermissions") return { behavior: "allow" };

  // Step 7: allow 规则
  const allowRule = findMatchingRule(toolName, ctx.allowRules, toolInput);
  if (allowRule) return { behavior: "allow", rule: allowRule };

  // Step 8: 只读工具默认放行
  if (readOnlyTools.has(toolName)) return { behavior: "allow" };

  // Step 9: 默认 ask
  return { behavior: "ask" };
}
```

### Bash 工具的 checkPermissions

```typescript
const SAFE_COMMANDS = /^\s*(ls|cat|echo|pwd|grep|git\s+(status|log|diff))\b/;
const DANGEROUS_PATTERNS = /\b(rm\s+-rf\s+\/|sudo|chmod\s+777)\b/;

function checkBashPermissions(input): PermissionDecision {
  const command = input.command;

  if (DANGEROUS_PATTERNS.test(command))
    return { behavior: "deny", message: "危险命令被阻止" };

  if (SAFE_COMMANDS.test(command))
    return { behavior: "allow", message: "安全只读命令" };

  return { behavior: "ask", message: "需要确认执行" };
}
```

## 验证

```bash
cd agents/s32-permission-engine
npx tsx src/cli.tsx

# 尝试：
> 执行 ls -la   # → 自动 allow（安全命令）
> 执行 rm -rf / # → 自动 deny（危险命令）
> 执行 npm install # → ask（需要确认）
```

## 对照 Claude Code

| 维度 | 教学版 (s32) | Claude Code |
|------|-------------|-------------|
| 规则来源 | 4 种（user/project/session/cli） | 8+ 种（含 policy/flag/local/command） |
| 模式 | 4 种 | 6+ 种（含 auto 分类器 + bubble） |
| 工具匹配 | 简单字符串匹配 | MCP 前缀语义 + legacy 别名 + 通配符 |
| Bash 分类 | 正则匹配 | 完整的 shell 命令分类器（bashClassifier） |
| 安全检查 | checkPermissions 返回值 | safetyCheck + requiresUserInteraction + 多层 hook |
| 拒绝追踪 | 无 | denialTracking（连续拒绝后切换模式） |
| 持久化 | 无 | PermissionUpdate 写入用户/项目设置文件 |

## 深入思考

1. **deny 优先原则**：决策流水线中 deny 在最前面——这确保了安全规则不会被后续的 allow 规则覆盖。安全系统的默认行为应该是"拒绝"。
2. **内容级 ask 不受 bypass 影响**：即使用户开启了 bypass 模式，针对特定内容的 ask 规则仍然会拦截。这防止了"我开了 bypass 就能干任何事"的风险。
3. **工具 checkPermissions 的分层**：全局规则引擎做粗粒度控制，每个工具自己做细粒度控制。bash 知道哪些命令安全，file_edit 知道哪些路径敏感。

## 练习

1. 为 `file_write` 工具添加 `checkPermissions`：禁止写入 `/etc/` 和 `~/.ssh/` 目录
2. 实现规则持久化：将 session 规则保存到 `.agent-permissions.json`
3. 添加正则类型的 ruleContent：支持 `bash("^git\s+")` 这样的正则匹配
