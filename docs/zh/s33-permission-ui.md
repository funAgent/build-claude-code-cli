# s33 — 权限 UI：交互式审批对话框

## 问题场景

权限引擎（s32）返回 ask——现在需要一个 UI 让用户做决定。

```
权限 ask 时的 UX 挑战：

  Agent 调用 bash({command: "npm install"})
       ↓
  权限引擎: ask
       ↓
  ??? 如何暂停执行？
  ??? 如何展示操作预览？
  ??? 如何让用户快速决策？
  ??? 如何"记住"用户的选择？
```

## 设计决策

### 权限 UI 的交互流

```
ask 触发的完整流程：

  Agent Loop
  ├── API 返回 tool_use: bash("npm install")
  ├── 权限检查: ask
  │
  ├── 暂停工具执行 ←── Promise pending
  │
  ├── 渲染 PermissionPrompt
  │   ┌─────────────────────────────────┐
  │   │ 🔒 需要权限确认                  │
  │   │                                  │
  │   │ 工具: bash                       │
  │   │ $ npm install                    │
  │   │ 原因: 需要确认执行               │
  │   │                                  │
  │   │ ❯ Allow (本次允许)               │
  │   │   Deny (拒绝)                    │
  │   │   Always Allow (始终允许此工具)    │
  │   └─────────────────────────────────┘
  │
  ├── 用户选择 Allow
  │   └── Promise resolve("allow")
  │
  └── 恢复工具执行
      └── 执行 bash("npm install")
```

### "记住选择"的实现

```
Always Allow 的规则注入：

  用户选择 "Always Allow (始终允许 bash)"
       ↓
  addRule(ctx, {
    source: "session",
    behavior: "allow",
    value: { toolName: "bash" }
  })
       ↓
  后续所有 bash 调用
       ↓
  hasPermissionsToUseTool → Step 7 → 匹配 allow 规则
       ↓
  直接放行，不再询问
```

### 工具专属预览

```
不同工具展示不同的预览内容：

  bash:
  ┌───────────────────────┐
  │ $ npm install         │  ← 显示完整命令
  └───────────────────────┘

  file_edit:
  ┌───────────────────────┐
  │ 编辑: src/auth.ts     │  ← 显示文件路径
  │ - old code            │  ← diff 预览
  │ + new code            │
  └───────────────────────┘

  file_write:
  ┌───────────────────────┐
  │ 写入: config.json     │  ← 显示文件路径
  │ (142 bytes)           │
  └───────────────────────┘
```

## 实现

### PermissionPrompt 组件

```tsx
export function PermissionPrompt({
  toolName, toolInput, decision, onChoice,
}: PermissionPromptProps) {
  const [selected, setSelected] = useState(0);
  const options = [
    { label: "Allow (本次允许)", value: "allow" },
    { label: "Deny (拒绝)", value: "deny" },
    { label: "Always Allow (始终允许)", value: "always_allow" },
  ];

  useInput((_input, key) => {
    if (key.upArrow) setSelected(s => Math.max(0, s - 1));
    if (key.downArrow) setSelected(s => Math.min(2, s + 1));
    if (key.return) onChoice(options[selected].value);
  });

  return (
    <Box borderStyle="round" borderColor="yellow">
      <Text bold>🔒 需要权限确认</Text>
      <Text>工具: {toolName}</Text>
      <Text dimColor>{getPreview(toolName, toolInput)}</Text>
      {options.map((opt, i) => (
        <Text color={i === selected ? "cyan" : "white"}>
          {i === selected ? "❯ " : "  "}{opt.label}
        </Text>
      ))}
    </Box>
  );
}
```

### PermissionManager

```typescript
export class PermissionManager {
  async checkPermission(tool, input): Promise<{allowed, message?}> {
    let decision = hasPermissionsToUseTool(tool.name, input, this.ctx);
    decision = applyModePolicy(decision, this.ctx.mode);

    if (decision.behavior === "allow") return { allowed: true };
    if (decision.behavior === "deny") return { allowed: false };

    // ask → 挂起执行，等待用户 UI 响应
    const choice = await new Promise(resolve => {
      this.onPermissionRequest({ toolName, decision, resolve });
    });

    if (choice === "always_allow") {
      addRule(ctx, { source: "session", behavior: "allow", ... });
    }
    return { allowed: choice !== "deny" };
  }
}
```

关键：`Promise` 将异步的 UI 交互转为同步的等待——Agent Loop 在用户做出选择前不会继续执行。

## 验证

```bash
cd agents/s33-permission-ui
npm run dev

> 帮我安装依赖并创建一个新文件
# bash("npm install") → 弹出权限对话框
# 选择 Allow → 执行
# 选择 Always Allow → 后续 bash 命令不再询问
```

## 对照 Claude Code

| 维度 | 教学版 (s33) | Claude Code |
|------|-------------|-------------|
| UI 组件 | 通用 PermissionPrompt | 工具专属（BashPermissionRequest + FileEditPermissionRequest + FallbackPermissionRequest） |
| 预览 | 文本预览 | diff 渲染、命令高亮、文件路径面包屑 |
| 选项 | Allow / Deny / Always Allow | 同 + "Allow with edits"（修改输入后允许） + "Reject with feedback"（拒绝并说明原因） |
| 记住选择 | session 规则（内存） | PermissionUpdate 持久化到设置文件 |
| 挂起机制 | Promise + resolve | ToolUseConfirm 回调 + onAllow/onReject |
| 反馈输入 | 无 | Tab 展开文本输入（"tell Claude what to do next"） |

## 深入思考

1. **Promise 挂起模式**：这是将 UI 交互嵌入异步流程的经典模式。Agent Loop 在 `await checkPermission()` 处暂停，用户操作 UI 后 `resolve` 释放控制流。
2. **Always Allow 的安全取舍**：session 级 allow 只在当前会话有效，退出后清除。如果持久化到文件（user/project settings），需要更谨慎——用户可能忘记自己曾经批准过。
3. **工具专属 UI 的价值**：显示 `$ rm -rf /tmp` 比显示 `bash({"command": "rm -rf /tmp"})` 让用户更快做出判断。好的权限 UI 不是打断，是信任建设。

## 练习

1. 为 `file_edit` 创建专属的 `FileEditPermissionRequest`：显示 old_string → new_string 的 diff
2. 添加 "Reject with feedback" 选项：用户可以输入拒绝原因，作为 tool_result 返回给模型
3. 实现键盘快捷键：`y` = Allow, `n` = Deny, `a` = Always Allow
