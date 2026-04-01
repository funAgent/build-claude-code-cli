# s20 — 基础 Streaming：逐 token 显示

## 问题场景

到 s19 为止，我们的 Agent 调用 `messages.create()` 获得完整响应后才开始显示。用户发送一个复杂问题后，屏幕可能空白 10-30 秒——这在 CLI 产品中是不可接受的体验。

想象一下 ChatGPT 如果每次都等到回答完成才显示结果……没人会用它。**流式输出不是可选优化，是 Agent 产品的基本体验要求**。

## 设计决策

### create() vs stream()

```
create() 模式:
  请求 ───────────────────────────────────→  ✓ 完整响应
       ↑                                  ↑
       └────────── 等待 5-30 秒 ──────────┘  (用户看空白屏幕)

stream() 模式:
  请求 ──→ "t" ──→ "o" ──→ "k" ──→ "e" ──→ "n" ──→ ... ──→ ✓ 完整
       ↑     ↑       ↑       ↑       ↑       ↑           ↑
       └── 第1秒 ────┴── 第2秒 ────┴── 第3秒 ─┘ (用户逐字看到)
```

Anthropic SDK 提供两种方式：
- `messages.create()` → 一次性返回完整 Message
- `messages.stream()` → 返回事件流，逐 token 推送

核心事件类型：

| 事件 | 含义 |
|------|------|
| `content_block_start` | 新的 content block 开始 |
| `content_block_delta` | 增量内容（文本/JSON） |
| `content_block_stop` | block 结束 |
| `message_start` | 消息开始 |
| `message_stop` | 消息结束 |

### 流式文本的 UI 处理

关键问题：text_delta 到达时，如何更新 UI？

**方案 A**（不可取）：每个 delta 插入一条新消息 → 消息列表会有几百条

**方案 B**（我们的选择）：维护一个 `streamingText` buffer，delta 拼接进去

```
状态流转:

  messages: [msg1, msg2, msg3]     streamingText: undefined
        ↑                                   ↑
        │                                   │
  用户输入 ──→ Agent 开始流式输出 ──→ streamingText = ""
                                              ↓
  ┌───────────────────────────────────────────┐
  │ text_delta: "Hello"                      │
  │   ↓                                       │
  │ streamingText = "Hello"   (UI 显示 "Hello▍") │
  │                                           │
  │ text_delta: " world"                     │
  │   ↓                                       │
  │ streamingText = "Hello world"            │
  │   ↓                                       │
  │ text_done                                 │
  │   ↓                                       │
  │ messages.push(streamingText)              │
  │ streamingText = undefined (▍ 光标消失)     │
  └───────────────────────────────────────────┘
        ↓
  messages: [msg1, msg2, msg3, "Hello world"]
```

### 光标闪烁效果

流式输出时在文字末尾显示 `▍` 光标，给用户"正在打字"的视觉反馈。文字完成后光标消失。

## 实现

### Agent 层：用 stream() 替代 create()

```typescript
// s19 — 同步等待
const response = await this.client.messages.create({ ... });

// s20 — 流式输出
const stream = this.client.messages.stream({ ... });
stream.on("text", (text) => {
  onOutput({ type: "text_delta", content: text });
});
const response = await stream.finalMessage();
onOutput({ type: "text_done", content: "" });
```

`stream.on("text", callback)` 是 SDK 的高层封装，每收到一段文本就触发。`stream.finalMessage()` 等待完成并返回完整 Message 对象，用于后续工具调用循环。

### REPL 层：增量拼接

```typescript
const [streamingText, setStreamingText] = useState<string | undefined>();
const streamBufRef = useRef("");

// 处理 Agent 输出
case "text_delta":
  streamBufRef.current += out.content;
  setStreamingText(streamBufRef.current);
  break;
case "text_done":
  addMessage("assistant", streamBufRef.current);
  streamBufRef.current = "";
  setStreamingText(undefined);
  break;
```

为什么用 `useRef` + `setState` 双轨？
- `useRef` 保存最新值，避免闭包陷阱
- `setState` 触发 re-render 更新 UI

### MessageList：流式文本渲染

```typescript
function StreamingMessage({ content }: { content: string }) {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text wrap="wrap">{content}<Text dimColor>▍</Text></Text>
    </Box>
  );
}
```

### Spinner 智能隐藏

流式文本正在输出时，不显示 "thinking..." spinner：

```typescript
{running && !streamingText && (
  <Spinner label="thinking" />
)}
```

## 验证

```bash
cd agents/s20-basic-streaming && npx tsx src/cli.tsx
```

1. 发送 "explain what streaming means" → 文字逐字出现
2. 观察光标 `▍` 在文字末尾闪烁
3. 回答完成后光标消失，文字保留在消息列表中
4. 发送 "list files in current directory" → 工具调用后继续流式输出

## 对照 Claude Code

| 维度 | 教学版 (s20) | Claude Code |
|------|-------------|-------------|
| 流式方式 | SDK `stream()` helper | raw `Stream<BetaRawMessageStreamEvent>` |
| 事件处理 | `stream.on("text")` 高层 API | 直接解析 SSE 事件 |
| 原因 | SDK 内部对 `input_json_delta` 做 O(n²) partialParse | 手动累积 JSON 避免性能问题 |
| buffer 管理 | useRef + setState | 专用 StreamingAssistantMessage 组件 |
| 使用量追踪 | 无 | 流式累加 input/output tokens |

**为什么 Claude Code 不用 SDK 的 stream helper？**

SDK 的 `BetaMessageStream` 在每个 `input_json_delta` 事件上调用 `partialParse`，尝试解析不完整的 JSON。这是 O(n) 每次，累积起来是 O(n²)。对于大型工具输入（如写入一整个文件），这会造成明显卡顿。Claude Code 选择手动累积 JSON 字符串，只在 `content_block_stop` 时解析一次。

## 深入思考

1. **流式输出 vs 批量输出的取舍**：流式需要更复杂的状态管理，但用户体验远超批量。在 AI 产品中，感知延迟比实际延迟更重要。
2. **React re-render 频率**：每个 token 触发一次 setState → re-render。在终端中这不是问题（Ink 有 diff 算法），但在 Web 中可能需要 debounce 或 requestAnimationFrame。
3. **如果流式中断怎么办？** 目前我们在 catch 中把已收到的 streamingText 保存为消息。s21 会引入更完善的错误恢复。

## 练习

1. 在 `stream.on("text")` 回调中加一个 token 计数器，在 StatusBar 显示实时 token 数
2. 尝试给流式文本加上打字机音效（终端 bell: `\x07`）
3. 实现一个"停止生成"功能：用户按 Esc 时调用 `stream.abort()`
