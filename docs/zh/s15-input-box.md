# s15 — 输入框：多行编辑 + 历史记录

## 问题场景

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
npx tsx src/cli.tsx
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
