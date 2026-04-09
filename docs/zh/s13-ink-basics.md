# s13 — Ink 入门：React 渲染终端

> **Your terminal is just another render target**

`[ Phase 3: 终端 UI ]` · 工具数: 9 · 代码量: ~150 行

---

## 前置知识

- 需要完成: s12 [工具注册表]

## 你将学到

- Ink 框架——用 React 组件渲染终端 UI
- Box/Text 组件替代 console.log
- Agent 输出通过回调解耦，实现 UI 与逻辑分离

前 12 课的 CLI 全靠 `console.log` + `readline` 输出。随着消息增多，你会发现：

- 工具输出和 assistant 回复混在一起，**难以区分**；
- 想加个 Spinner、进度条？只能手写 ANSI 转义码；
- `readline` 的输入体验极其有限——无法上下翻页、无法多行编辑。

Claude Code 的做法是引入 **Ink**——一个让你用 React 组件渲染终端 UI 的框架。

## 设计决策

### 为什么选 Ink 而非 blessed/terminal-kit？

Ink 的核心理念：**终端和浏览器的心智模型一样——组件 + 状态 + 渲染**。

- `Box` = HTML 的 `div`（Flexbox 布局）
- `Text` = HTML 的 `span`（文字样式）
- `useState` / `useEffect` 和 Web React 完全相同
- 前端开发者**零学习曲线**

### Agent 输出解耦

将 `console.log` 替换为 `onOutput` 回调：

```typescript
// s12: 直接输出
console.log(`assistant> ${text}`);

// s13: 回调解耦
onOutput({ type: "assistant", content: text });
```

这使 Agent 与 UI 完全分离——同一个 Agent 可以接 Ink、接 Web、接测试。

## 实现要点

```tsx
// cli.tsx — 一行代码把 React 渲染到终端
import { render } from "ink";
render(<App />);

// components/app.tsx — Box/Text 替代 console.log
<Box flexDirection="column">
  {lines.map(line => (
    <Box key={line.id}>
      <Text color={colorMap[line.type]}>{line.content}</Text>
    </Box>
  ))}
</Box>
```

Agent 的 `run` 方法接受回调，UI 组件通过 `useState` 管理消息列表：

```typescript
await agent.run(input, (out) => {
  setLines(prev => [...prev, { type: out.type, content: out.content }]);
});
```

## 运行验证

```bash
cd agents/s13-ink-basics
npm install
npm run dev
# 看到 Ink 渲染的彩色终端界面
# 输入问题，观察消息以 React 组件形式渲染
# ESC 退出
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 渲染入口 | `render(<App />)` | `ink.ts` 封装 `render` + `createRoot` + ThemeProvider |
| 组件基础 | 原生 `Box` / `Text` | ThemedBox / ThemedText（设计系统包装） |
| Agent 输出 | `onOutput` 回调 | React 状态驱动（useAppState） |

生产版的 `ink.ts` 还会注入 `ThemeProvider`，使所有子组件都能访问主题色。

## 深入思考

1. **为什么 render 是异步的？** Ink 内部创建了 React reconciler 实例，需要挂载到终端 stdout。
2. **Ink 和 React DOM 的区别？** 渲染目标不同——一个写 ANSI 到 stdout，一个写 DOM 到 document。但 Reconciler 调度完全一致。
3. **回调 vs 事件 vs Observable**：`onOutput` 回调是最简方案；生产版会用 React state + context 做更精细的更新控制。

## 练习

1. 给 App 组件添加一个当前时间显示（用 `useEffect` + `setInterval`），体验 Ink 的重渲染机制。
2. 尝试把 `Box` 的 `flexDirection` 改为 `"row"`，观察布局变化。
3. 对比 `agents/s12-tool-registry/src/cli.ts` 和 `agents/s13-ink-basics/src/cli.tsx`，列出所有差异点。

<details><summary>练习 1 参考实现</summary>

```typescript
import React, { useState, useRef, useCallback, useEffect } from "react";
// ... 其余 import 不变

export function App(): React.ReactElement {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ... 原有 state / agentRef / handlers 不变

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text dimColor>{new Date(now).toLocaleTimeString()}</Text>
      </Box>
      {/* 标题栏、消息列表、输入行等 */}
    </Box>
  );
}
```

要点：`setInterval` 每秒更新 `now`，`useState` 触发重绘，终端里会看到时间跳动；`useEffect` 清理函数在卸载时 `clearInterval`，避免泄漏。

</details>

<details><summary>练习 2 参考实现</summary>

```typescript
// 将根布局从纵向改为横向（子节点从左到右排布）
<Box flexDirection="row" padding={1}>
  {/* 标题栏、消息、输入等仍为子节点，视觉会从「自上而下」变为「从左到右」 */}
</Box>
```

要点：`column` 时整块 UI 垂直堆叠；改为 `row` 后，原先上下排列的 `Box`/`Text` 会沿水平方向排列，便于直观理解 Ink 的 Flex 与 Web 的对应关系。

</details>

<details><summary>练习 3 参考实现</summary>

```typescript
// s12：commander + readline 循环
// s13：Ink render，无 commander 交互封装

// cli.ts（s12）— 节选
import { Command } from "commander";
import * as readline from "node:readline";
// program.option / .argument → readline.question 循环 → agent.run(prompt)

// cli.tsx（s13）— 节选
import { render } from "ink";
import { App } from "./components/app.js";
render(React.createElement(App));
```

要点对比（可按文件逐项核对）：

- **入口与依赖**：s12 用 `commander` 解析 `--read-only`、可选 `[prompt]`；s13 无 CLI 子命令，直接 `render(React.createElement(App))`。
- **交互**：s12 用 `readline` 的 `question` 循环 + `/tools`、`/exit`；s13 在 `App` 里用 Ink 的 `useInput` 收输入，ESC 退出。
- **输出**：s12 依赖 `console.log`（含 Agent 内部）；s13 通过 `onOutput` 推状态，由 React 组件绘制。
- **扩展名与 JSX**：`cli.ts` 无 JSX；`cli.tsx` 为 Ink/React 入口。
- **与 Agent 的耦合**：s12 `agent.run(text)` 无 UI 回调；s13 `agent.run(text, onOutput)` 将 assistant/tool 输出交给界面。

</details>

## 下一课预告

s13 实现了基础渲染，但所有消息看起来都一样。下一课 **s14 消息列表** 将为用户消息、AI 回复、工具调用等不同类型设计独立的渲染组件。
