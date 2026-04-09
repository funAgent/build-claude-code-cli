# s34 — 子 Agent 权限：继承与隔离

## 问题场景

主 Agent 运行中，用户批准了 `bash` 的 Always Allow。然后主 Agent 创建子 Agent：

```
权限继承的风险：

  主 Agent
  ├── 用户: Always Allow bash → session 规则
  ├── bash("npm install")  ← 用户批准
  │
  └── 创建子 Agent
      └── bash("rm -rf .")  ← 如果继承了 session allow...
          → 不会再询问用户！
          → 直接执行！
```

**Children can be stricter, never looser.**

## 设计决策

### Session Allow 不继承

```
权限传递策略：

  父 Agent 权限上下文:
  ┌──────────────────────────────────────┐
  │ allowRules:                           │
  │   cliArg:    [bash("npm test")]      │ ← 继承 ✓
  │   userSettings: [file_read]           │ ← 继承 ✓
  │   session:   [bash] ← Always Allow   │ ← 不继承 ✗
  │                                       │
  │ denyRules:                            │
  │   projectSettings: [bash("rm -rf")]  │ ← 继承 ✓
  │                                       │
  │ askRules:                             │
  │   userSettings: [file_write]          │ ← 继承 ✓
  └──────────────────────────────────────┘
            ↓ createSubagentPermissionContext()
  子 Agent 权限上下文:
  ┌──────────────────────────────────────┐
  │ allowRules:                           │
  │   cliArg:    [bash("npm test")]      │ ← 保留
  │   userSettings: [file_read]           │ ← 保留
  │   ✗ session allow 已被清除            │
  │                                       │
  │ denyRules:   完整继承                  │
  │ askRules:    完整继承                  │
  └──────────────────────────────────────┘

  结果：子 Agent 的 bash 调用会重新触发 ask
```

### 权限模式收紧

```
模式继承规则（只能更严，不能更松）：

  宽松度排序: dontAsk < default < acceptEdits < bypass

  父: default + 子请求: acceptEdits
  → 结果: default（子不能更松）

  父: bypass + 子请求: default
  → 结果: default（子可以更严）

  父: acceptEdits + 子请求: bypass
  → 结果: acceptEdits（子不能更松）
```

### 无 UI 子 Agent

```
异步子 Agent 的权限策略：

  同步子 Agent（阻塞父 Agent）:
  ├── 可以弹出权限 UI
  └── ask → 用户看到 PermissionPrompt

  异步子 Agent（后台运行）:
  ├── 不能弹出权限 UI（没有前台终端）
  ├── shouldAvoidPermissionPrompts = true
  └── ask → 自动 deny

  特殊: bubble 模式
  ├── 异步子 Agent 仍可冒泡到父 Agent
  └── 权限提示显示在父 Agent 的 UI 中
```

## 实现

### 创建子 Agent 权限上下文

```typescript
export function createSubagentPermissionContext(
  parentCtx: PermissionContext,
  options: { allowedTools?: string[] } = {},
): PermissionContext {
  const childCtx = createPermissionContext(parentCtx.mode);

  // session allow 不继承
  childCtx.allowRules = parentCtx.allowRules
    .filter(r => r.source !== "session");

  // 如果指定了 allowedTools，用显式白名单
  if (options.allowedTools) {
    childCtx.allowRules.push(
      ...options.allowedTools.map(name => ({
        source: "session", behavior: "allow",
        value: { toolName: name },
      }))
    );
  }

  // deny 和 ask 完整继承（只能更严）
  childCtx.denyRules = [...parentCtx.denyRules];
  childCtx.askRules = [...parentCtx.askRules];

  return childCtx;
}
```

### 权限模式解析

```typescript
function resolveSubagentMode(
  parentMode: PermissionMode,
  requestedMode?: PermissionMode,
): PermissionMode {
  const STRICTNESS = { dontAsk: 0, default: 1, acceptEdits: 2, bypassPermissions: 3 };

  // 子不能比父更宽松
  if (STRICTNESS[requestedMode] > STRICTNESS[parentMode]) {
    return parentMode;
  }
  return requestedMode;
}
```

## 验证

```bash
cd agents/s34-subagent-permissions
npm run dev

# 1. 批准 Always Allow bash
# 2. 让 Agent 创建子 Agent
# 3. 观察子 Agent 的 bash 调用是否重新询问
```

## 对照 Claude Code

| 维度 | 教学版 (s34) | Claude Code |
|------|-------------|-------------|
| Session 隔离 | 过滤 source !== "session" | 替换 session 为显式 allowedTools 列表 |
| 模式收紧 | 简单数值比较 | 按模式类型特殊处理（bypass/acceptEdits 不被子覆盖） |
| 无 UI 策略 | isAsync → shouldAvoidPrompts | canShowPermissionPrompts + bubble 模式 + awaitAutomatedChecks |
| 权限冒泡 | 无 | bubble 模式：异步子 Agent 权限提示冒泡到父 UI |
| 工具池收紧 | 继承 deny 规则 | resolveAgentTools + per-agent disallowedTools + SDK 级别 cliArg 保留 |

## 深入思考

1. **"只能更严"原则**：这是安全系统的基本原则。子进程的权限是父进程的子集。如果子 Agent 能放宽权限，就相当于给了 Agent 一个"提权"后门。
2. **Session Allow 的风险**：用户对主 Agent 的 Always Allow 是基于信任——"我看到了你要做什么，我批准"。子 Agent 的操作用户看不到（独立上下文），所以不能继承这种信任。
3. **异步子 Agent 的两难**：不弹窗 → ask 自动 deny → 子 Agent 可能做不了事。弹窗 → 后台进程打断前台工作流。Claude Code 的 bubble 模式是一种折中：权限提示在父 Agent 的 UI 中展示。

## 练习

1. 实现 bubble 模式：异步子 Agent 的 ask 冒泡到父 Agent 的 PermissionPrompt
2. 添加审计日志：记录每个子 Agent 的权限检查结果和用户决策
3. 实现 "inherit" 选项：允许显式继承特定的 session 规则（需要用户确认）
