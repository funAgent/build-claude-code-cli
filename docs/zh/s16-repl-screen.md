# s16 — REPL 主屏：组装完整 TUI

## 问题场景

经过 s13-s15，我们有了所有组件：MessageList、PromptInput、Spinner、StatusBar。但它们还没有被**组装成一个完整的产品体验**。

一个专业的 CLI 需要：

- **欢迎页**：启动时显示品牌信息，而不是一片空白；
- **内置命令**：`/help`、`/clear`、`/tools` 等不需要 AI 处理的快捷操作；
- **状态管理**：欢迎页在第一次输入后消失，切换到对话视图；
- **窗口自适应**：根据终端宽度调整布局。

## 设计决策

### REPL = Read-Eval-Print Loop

REPL 主屏是所有组件的**组合根**（Composition Root）：

```
┌─────────────────────┐
│ Welcome / Messages  │  ← 互斥显示
│                     │
├─────────────────────┤
│ Spinner (条件)      │  ← 仅运行时显示
├─────────────────────┤
│ ❯ PromptInput       │  ← 始终可见
├─────────────────────┤
│ StatusBar           │  ← 始终可见
└─────────────────────┘
```

### 内置命令路由

以 `/` 开头的输入走命令路由，不发给 Agent：

```typescript
if (text.startsWith("/")) {
  if (handleCommand(text)) return; // 命中了内置命令
}
// 否则发给 Agent
```

### 欢迎页→对话的状态切换

```typescript
const [showWelcome, setShowWelcome] = useState(true);
// 第一次提交后：
if (showWelcome) setShowWelcome(false);
```

## 实现要点

```tsx
export function ReplScreen(): React.ReactElement {
  return (
    <Box flexDirection="column">
      {showWelcome ? <Welcome cwd={process.cwd()} /> : <MessageList messages={messages} />}
      {running && <Spinner label="thinking" />}
      <PromptInput onSubmit={handleSubmit} disabled={running} />
      <StatusBar messageCount={messages.length} model="claude-sonnet-4" isRunning={running} />
    </Box>
  );
}
```

`useStdout` 可以获取终端列数，用于未来的自适应布局。

## 运行验证

```bash
cd agents/s16-repl-screen
npm install
npm run dev
# 1. 看到欢迎页（品牌框 + 目录 + 模型 + 快捷键）
# 2. 输入 /help 测试内置命令
# 3. 输入问题，欢迎页消失，进入对话模式
# 4. 输入 /clear 清空消息，输入 /tools 查看工具
# 5. ESC 退出
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 主屏 | ReplScreen（~120 行） | screens/REPL.tsx（5000+ 行） |
| 欢迎 | Welcome 组件 | LogoV2 + StatusNotices |
| 命令 | switch 硬编码 | 命令解析器 + 模式栈 |
| 自适应 | useStdout 获取宽度 | useTerminalSize + 响应式布局 |

生产版 REPL.tsx 是整个应用的核心——它还管理权限请求 UI、MCP 连接、团队协作、全屏模式切换。

## 深入思考

1. **Composition Root 模式**：REPL 不做业务逻辑，只负责组装和状态分发。这和 React 应用的 App.tsx 角色一样。
2. **状态提升 vs Context**：目前所有状态在 ReplScreen 内管理。当组件更多时，应该引入 Context 或状态管理库。
3. **为什么 Claude Code 的 REPL 有 5000 行？** 因为它同时处理：权限确认流、工具沙盒 UI、团队视图、语音输入、全屏编辑器、Doctor 诊断——产品复杂度远超"对话 + 工具"。

## 练习

1. 给 Welcome 组件添加一个 ASCII Art Logo（提示：用模板字符串和 `Text` 组件）。
2. 实现 `/model` 命令，让用户在运行时切换 AI 模型。
3. 用 `useStdout` 的 `stdout.columns` 实现自适应：当终端宽度 < 60 时，隐藏 StatusBar 的快捷键提示部分。
