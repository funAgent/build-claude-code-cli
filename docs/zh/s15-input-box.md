# s15 — 输入框：多行编辑 + 历史记录

> **The input box is where your user lives**

`[ Phase 3: 终端 UI ]` · 工具数: 9 · 代码量: ~300 行

---

## 前置知识

- 需要完成: s14 [消息列表]

## 你将学到

- PromptInput 独立组件的设计
- 输入历史栈的实现（上下翻页浏览）
- Spinner 帧动画（思考中的反馈）
- StatusBar 底部状态栏

s14 的输入仍然是 `useInput` 直接拼字符串——一个字符一个字符地加。这有几个严重问题：

- **没有输入历史**：每次都要重新打字，效率极低；
- **删除只能退格**：无法按光标位置删除，无法全选清空；
- **没有加载反馈**：Agent 运行时输入框只是"呆住了"，不知道在等什么。

产品级 CLI 的输入框需要：历史浏览、Spinner 反馈、状态栏。

## 设计决策

### PromptInput 独立组件

把输入逻辑从 App 中彻底拆出，形成 `PromptInput` 组件：

- Props: `onSubmit` 回调 + `disabled` 禁用标志
- 内部状态: `input`（当前文本）+ `history`（历史栈）+ `historyIndex`（浏览位置）

### 输入历史实现

```typescript
// ↑ 上翻
const newIdx = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1);
setInput(history[newIdx]);

// ↓ 下翻
if (newIdx >= history.length) { setInput(""); } // 回到空白
```

### Spinner 帧动画

用 `useEffect` + `setInterval` 循环 Unicode Braille 字符：

```typescript
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
useEffect(() => {
  const timer = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), 80);
  return () => clearInterval(timer);
}, []);
```

### StatusBar

底部固定状态栏，显示 model、消息计数、快捷键提示。用 `borderStyle="single"` 做视觉分隔。

## 运行验证

```bash
cd agents/s15-input-box
npm install
npm run dev
# 输入几条消息后按 ↑↓ 浏览历史
# 观察 Agent 执行时的 Spinner 旋转动画
# 底部状态栏实时更新消息计数
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 输入组件 | PromptInput（~90 行） | PromptInput/（39 文件） |
| 历史 | 简单数组 + index | 持久化 + 搜索 + 文件存储 |
| 编辑 | 单行退格 | 多行 + Vim 模式 + Tab 补全 |
| Spinner | 帧动画 | SpinnerWithVerb + token 计数 + shimmer |

生产版 PromptInput 是一个微型应用：输入模式栈、命令队列、粘贴处理、语音输入。

## 深入思考

1. **为什么组件要 `disabled` 而不是"不渲染"？** 禁用态保留视觉位置（锚点），避免布局跳动。
2. **输入历史应该持久化吗？** CLI 产品通常会（如 bash history），通过文件系统存储上次会话的历史。
3. **Spinner 的 80ms 间隔**：太快会闪烁，太慢会感觉卡顿。80ms 是终端动画的经验值。

## 练习

1. 给 PromptInput 添加 `Ctrl+U`（清空当前输入）和 `Ctrl+A`（光标移到行首，这里简化为全选）。
2. 给 Spinner 增加 `elapsed` 计时器显示（如 `⠋ thinking… (3.2s)`）。
3. 给 StatusBar 增加当前工作目录的显示。

<details><summary>练习 1 参考实现</summary>

`useInput` 里识别 `key.ctrl` 与 `ch`（Ink 会给出对应字母）。`Ctrl+U` 直接清空并复位历史浏览索引；`Ctrl+A` 用布尔状态表示「全选」，下一次可打印字符替换整行（教学版无真实光标时的一种常见简化）。

```typescript
const [selectAll, setSelectAll] = useState(false);

useInput((ch, key) => {
  if (disabled) return;

  if (key.ctrl && (ch === "u" || ch === "U")) {
    setInput("");
    setHistoryIndex(-1);
    setSelectAll(false);
    return;
  }

  if (key.ctrl && (ch === "a" || ch === "A")) {
    setSelectAll(true);
    return;
  }

  // ... 其余分支不变，在可打印字符处：
  if (ch && !key.ctrl && !key.meta) {
    setInput((prev) => (selectAll ? ch : prev + ch));
    setSelectAll(false);
    setHistoryIndex(-1);
  }
});
```

要点：`Ctrl+A` 后下一次输入覆盖全文；若需要与退格等组合，记得在 `backspace` 分支里若 `selectAll` 则一次性清空。

</details>

<details><summary>练习 2 参考实现</summary>

用挂载时间戳 + 周期性 `setState` 驱动重渲染，把经过的毫秒格式化为一位小数秒。

```typescript
import React, { useState, useEffect, useRef } from "react";
import { Text } from "ink";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label = "thinking" }: { label?: string }): React.ReactElement {
  const [frame, setFrame] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const spin = setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 80);
    const clock = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current);
    }, 100);
    return () => {
      clearInterval(spin);
      clearInterval(clock);
    };
  }, []);

  const sec = (elapsedMs / 1000).toFixed(1);

  return (
    <Text color="yellow">
      {FRAMES[frame]} {label}… ({sec}s)
    </Text>
  );
}
```

要点：`Spinner` 挂载即开始计时；`100ms` 刷新足够平滑且开销小；Unmount 时清理两个定时器。

</details>

<details><summary>练习 3 参考实现</summary>

在 `StatusBar` 增加 `cwd`（或由上层传入 `process.cwd()`），用较短的 `path.basename` 或完整路径展示，避免撑爆一行时可配合 `dimColor` 截断。

```typescript
import * as path from "node:path";

export function StatusBar({
  messageCount,
  model,
  isRunning,
  cwd,
}: {
  messageCount: number;
  model: string;
  isRunning: boolean;
  cwd: string;
}): React.ReactElement {
  const short = path.basename(cwd);
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        {model} │ {messageCount} msgs │ 📁 {short}
      </Text>
      <Text dimColor>
        {isRunning ? "⏳ running" : "↑↓ history │ Enter send │ ESC quit"}
      </Text>
    </Box>
  );
}
```

要点：上层 `<StatusBar cwd={process.cwd()} ... />`；目录名用 `basename` 更易读，需要审计路径时再显示完整 `cwd`。

</details>

## 下一课预告

所有组件都准备好了，下一课 **s16 REPL 主屏** 将把它们组装成一个完整的产品体验——欢迎页、内置命令、状态切换，一气呵成。
