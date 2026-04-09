# s14 — 消息列表：渲染对话历史

> **Every message type deserves its own renderer**

`[ Phase 3: 终端 UI ]` · 工具数: 9 · 代码量: ~250 行

---

## 前置知识

- 需要完成: s13 [Ink 入门]

## 你将学到

- 类型→视觉映射——不同消息类型用不同组件渲染
- 代码块检测与渲染
- 工具结果的截断预览

s13 用一个简单的 `MessageLine` 渲染所有消息，但所有类型长得一样——用户输入、AI 回复、工具调用、工具结果全是单行文本。

实际对话里：

- **用户消息**需要醒目标识（"这是你说的"）；
- **AI 回复**可能包含代码块，需要特殊渲染；
- **工具调用**应该一目了然看到调了哪个工具；
- **工具结果**往往很长，需要截断预览。

## 设计决策

### 类型→视觉映射

每种消息类型对应独立的渲染组件：

```tsx
switch (message.type) {
  case "user":      return <UserMessage />;
  case "assistant":  return <AssistantMessage />;
  case "tool_call":  return <ToolCallMessage />;
  case "tool_result": return <ToolResultMessage />;
}
```

这与 Claude Code 的 `MessageRow.js` 策略一致——按类型分发到不同组件。

### 代码块检测

在 `AssistantMessage` 中用正则 `` ```...``` `` 识别代码块，用 `borderStyle="single"` 的 Box 包裹高亮。教学版做到"能区分"即可，生产版会用完整的 Markdown AST 解析。

### 长结果截断

`ToolResultMessage` 只显示前 5 行，多余的折叠为 `… (+N lines)`。避免工具输出淹没整个屏幕。

## 实现要点

```tsx
// 消息列表组件
export function MessageList({ messages }: { messages: Message[] }) {
  return (
    <Box flexDirection="column">
      {messages.map(msg => <MessageRow key={msg.id} message={msg} />)}
    </Box>
  );
}

// 代码块解析
function parseCodeBlocks(text: string): TextPart[] {
  const regex = /```[\w]*\n?([\s\S]*?)```/g;
  // 拆分为 { text, isCode } 数组
}
```

## 运行验证

```bash
cd agents/s14-message-list
npm install
npm run dev
# 输入"用 typescript 写一个 hello world"
# 观察：AI 回复中的代码块被 border 包裹
# 工具调用显示 ⚡ 前缀，结果显示 ← 前缀
```

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 消息分发 | switch 语句 | MessageRow + 类型组件库 |
| 代码高亮 | 正则拆分 + border | 完整 Markdown AST + 语法高亮 |
| 滚动 | 原生全量渲染 | VirtualMessageList（虚拟滚动） |
| 性能 | 无优化 | React.memo + OffscreenFreeze |

生产版的虚拟滚动是性能关键——对话可能有数百条消息，全量渲染会卡顿。

## 深入思考

1. **为什么 Claude Code 用虚拟滚动？** 当消息超过屏幕高度时，只渲染可见区域的组件，O(屏幕高度) 而非 O(消息总数)。
2. **OffscreenFreeze 是什么？** React 18+ 的特性，让被折叠/不可见的组件不参与 re-render。
3. **Markdown 到终端的局限**：终端没有字体变化，只能用颜色、边框、缩进来区分。

## 练习

1. 给 `UserMessage` 添加时间戳显示（从 `message.timestamp` 格式化）。
2. 实现 `AssistantMessage` 的 **加粗** 和 *斜体* 渲染（用 `Text` 的 `bold` / `italic` 属性）。
3. 给 `ToolResultMessage` 增加一个"展开/折叠"按钮（模拟按键切换完整/截断视图）。

<details><summary>练习 1 参考实现</summary>

```typescript
// MessageRow 传入完整 message，便于取 timestamp
function MessageRow({ message }: { message: Message }): React.ReactElement {
  switch (message.type) {
    case "user":
      return <UserMessage content={message.content} timestamp={message.timestamp} />;
    // ...
  }
}

function UserMessage({
  content,
  timestamp,
}: {
  content: string;
  timestamp: number;
}): React.ReactElement {
  const timeLabel = new Date(timestamp).toLocaleTimeString();
  return (
    <Box paddingTop={1}>
      <Text dimColor>{timeLabel} </Text>
      <Text color="green" bold>
        {"❯ "}
      </Text>
      <Text color="green" bold wrap="wrap">
        {content}
      </Text>
    </Box>
  );
}
```

要点：时间用 `message.timestamp`（`Date.now()` 毫秒）格式化成可读字符串；`dimColor` 与时间前缀搭配可弱化视觉噪声。

</details>

<details><summary>练习 2 参考实现</summary>

```typescript
function AssistantMessage({ content }: { content: string }): React.ReactElement {
  const parts = parseCodeBlocks(content);
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      {parts.map((part, i) =>
        part.isCode ? (
          <Box key={i} borderStyle="single" borderColor="gray" paddingX={1} marginY={1}>
            <Text color="cyan">{part.text}</Text>
          </Box>
        ) : (
          <Box key={i} flexDirection="row" flexWrap="wrap">
            {renderInlineEmphasis(part.text)}
          </Box>
        ),
      )}
    </Box>
  );
}

/** 在非代码片段中解析 **粗体** 与 *斜体*（先处理粗体再处理单段斜体，避免与 ** 冲突） */
function renderInlineEmphasis(text: string): React.ReactNode {
  const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return segments.map((seg, i) => {
    if (seg.startsWith("**") && seg.endsWith("**")) {
      return (
        <Text key={i} bold>
          {seg.slice(2, -2)}
        </Text>
      );
    }
    if (seg.startsWith("*") && seg.endsWith("*") && !seg.startsWith("**")) {
      return (
        <Text key={i} italic>
          {seg.slice(1, -1)}
        </Text>
      );
    }
    return (
      <Text key={i} wrap="wrap">
        {seg}
      </Text>
    );
  });
}
```

要点：代码块仍走 `parseCodeBlocks`；普通文本再拆成 `Text` 片段并设置 `bold`/`italic`。教学版用正则分段即可，复杂嵌套需更完整解析。

</details>

<details><summary>练习 3 参考实现</summary>

```typescript
import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

function ToolResultMessage({ content }: { content: string }): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const over5 = lines.length > 5;
  const displayLines =
    !expanded && over5
      ? [...lines.slice(0, 5), `… (+${lines.length - 5} lines)`]
      : lines;

  useInput(
    (input, key) => {
      if (key.ctrl && input === "o") setExpanded((v) => !v);
    },
    { isActive: over5 },
  );

  return (
    <Box paddingLeft={4} flexDirection="column">
      {over5 && (
        <Box marginBottom={0}>
          <Text dimColor>{"← "}</Text>
          <Text color="cyan" bold>
            {expanded ? "[Ctrl+O 折叠]" : "[Ctrl+O 展开]"}
          </Text>
        </Box>
      )}
      <Text dimColor>{displayLines.join("\n")}</Text>
    </Box>
  );
}
```

要点：用 `useState` 在「前 5 行 + 提示」与「全文」之间切换；`Ctrl+O` 不会进入主输入行的普通字符逻辑，便于与 `App` 里 `useInput` 共存。若需改用其他快捷键，保持「组合键或空闲态」以免与输入抢键。终端需支持组合键上报。

</details>

## 下一课预告

消息显示没问题了，但输入体验还很原始。下一课 **s15 输入框** 将实现历史记录浏览、Spinner 加载反馈和状态栏。
