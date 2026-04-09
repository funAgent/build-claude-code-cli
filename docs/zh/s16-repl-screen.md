# s16 — REPL 主屏：组装完整 TUI

> **Compose, don't inherit**

`[ Phase 3: 终端 UI ]` · 工具数: 9 · 代码量: ~350 行

---

## 前置知识

- 需要完成: s15 [输入框]

## 你将学到

- Composition Root 模式组装所有组件
- 欢迎页 → 对话视图的状态切换
- 内置命令路由（/help、/clear、/tools）
- 终端窗口自适应布局

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

<details><summary>练习 1 参考实现</summary>

用多行字符串定义 Logo（模板字符串或字符串数组 + `join` 均可），按行 `split` 后用多行 `Text` 渲染，便于对齐与单独着色。

```typescript
const ASCII_LOGO = [
  "  __  __       _   ",
  " |  \\/  | ___ | |_ ",
  " | |\\/| |/ _ \\| __|",
  " | |  | | (_) | |_ ",
  " |_|  |_|\\___/|__| ",
].join("\n");

export function Welcome({ cwd }: { cwd: string }): React.ReactElement {
  const lines = ASCII_LOGO.split("\n");
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {lines.map((line, i) => (
        <Text key={i} bold color="cyan">
          {line}
        </Text>
      ))}
      {/* ... 其余 Welcome 内容 */}
    </Box>
  );
}
```

要点：若用 `` `...` `` 且首行是空行，可用 `trim()` 去掉首尾空白；每行一个 `Text` 可避免空格被折叠导致的错位。

</details>

<details><summary>练习 2 参考实现</summary>

在 `ReplScreen` 用 `useState` 保存当前模型名；`handleCommand` 解析 `/model` 与子参数，更新状态并可选地 `addMessage` 提示；把 `model` 传给 `StatusBar` 与 `Welcome`（若上面写死模型名则改为 props）。

```typescript
const [model, setModel] = useState("claude-sonnet-4");

const handleCommand = useCallback(
  (raw: string): boolean => {
    const trimmed = raw.trim();
    const [head, ...rest] = trimmed.split(/\s+/);

    if (head === "/model") {
      const name = rest.join(" ").trim();
      if (!name) {
        addMessage("assistant", "用法: /model <模型名>  例: /model claude-sonnet-4");
        return true;
      }
      setModel(name);
      addMessage("assistant", `已切换模型: ${name}`);
      return true;
    }

    switch (trimmed) {
      case "/help":
        // ...
        return true;
      default:
        return false;
    }
  },
  [addMessage /* ... */],
);

// <StatusBar model={model} ... />
// <Welcome cwd={...} model={model} /> 若欢迎页展示模型
```

要点：用 `split(/\s+/)` 切分首 token；若模型名本身含空格，可改用 `raw.slice("/model".length).trim()` 取参数。真正请求仍走 `Agent` 时需在调用前把 `model` 传入 agent 配置（教学版可仅改 UI 与提示）。

</details>

<details><summary>练习 3 参考实现</summary>

`useStdout()` 得到 `stdout.columns`（可能为 `undefined`，需回退）；将「是否显示快捷键区」作为 prop 传入 `StatusBar`，窄终端只保留左侧信息。

```typescript
const { stdout } = useStdout();
const columns = stdout?.columns ?? 80;
const showShortcutHints = columns >= 60;

// ...
<StatusBar
  messageCount={messages.length}
  model={model}
  isRunning={running}
  showShortcutHints={showShortcutHints}
/>
```

```typescript
export function StatusBar({
  messageCount,
  model,
  isRunning,
  showShortcutHints = true,
}: {
  messageCount: number;
  model: string;
  isRunning: boolean;
  showShortcutHints?: boolean;
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        {model} │ {messageCount} msgs
      </Text>
      {showShortcutHints ? (
        <Text dimColor>
          {isRunning ? "⏳ running" : "↑↓ history │ Enter send │ ESC quit"}
        </Text>
      ) : (
        <Text dimColor>{isRunning ? "⏳" : ""}</Text>
      )}
    </Box>
  );
}
```

要点：阈值 `60` 可按产品调整；极窄时右侧可只显示运行中的 `⏳` 或留空，避免与左侧重叠。

</details>

## Phase 3 总结

恭喜！完成 s13-s16，你的 Agent 已经有了**专业的终端 UI**：

- ✅ Ink React 渲染（s13）
- ✅ 消息列表组件（s14）
- ✅ 输入框 + 历史记录（s15）
- ✅ REPL 主屏组装（s16）

下一个 Phase 将深入 Prompt 工程——让 Agent 更聪明。**s17 System Prompt** 开始。

## 下一课预告

Agent 已经能跑、能看、能交互了。但它的行为靠"默认人格"驱动，没有定制化。下一课 **s17 System Prompt** 将设计 Agent 的"灵魂"——通过 system prompt 让它知道自己是做什么的、应该怎么做。
