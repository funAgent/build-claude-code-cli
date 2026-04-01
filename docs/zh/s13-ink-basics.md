# s13 — Ink 入门：React 渲染终端

## 问题场景

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
npx tsx src/cli.tsx
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
