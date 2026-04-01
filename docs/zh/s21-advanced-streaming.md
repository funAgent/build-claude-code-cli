# s21 — Streaming 进阶：thinking + 工具流式 + 容错

## 问题场景

s20 实现了基础的文本流式输出。但真实的 Agent 交互远不止文字——还有：

1. **Thinking blocks**：Claude 的"思考过程"也是流式到达的，如何展示？
2. **Tool use blocks**：工具调用的 JSON 参数是一段一段到达的，需要边收边拼
3. **流式超时**：如果 API 卡住了怎么办？
4. **降级回退**：streaming 完全失败时，能否自动切换到 `create()`？

## 设计决策

### Raw Event 处理

s20 用 `stream.on("text")` 只拿到了文本。要处理 thinking 和 tool_use，需要监听底层事件：

```
stream.on("event", (event) => {
  switch (event.type) {
    case "content_block_start":
      // block.type 可能是 "text" | "thinking" | "tool_use"
    case "content_block_delta":
      // delta.type 可能是 "text_delta" | "thinking_delta" | "input_json_delta"
    case "content_block_stop":
      // block 结束
  }
})
```

### Thinking Block 的 UX 处理

Thinking 内容通常很长且技术性强，不应和正文混在一起：

```
方案 A: 完全隐藏 → 用户不知道 AI 在思考什么
方案 B: 全量显示 → 干扰正文阅读
方案 C: 折叠预览 → 显示最后 120 字符 + "💭" 前缀
```

我们选择方案 C：流式时显示 thinking 尾部，完成后保存为可折叠的 "thinking" 消息。

### 工具调用的流式解析

工具的 input JSON 是增量到达的：

```
工具 JSON 流式拼装过程:

  content_block_start
         │
         └──→ 工具 #1: file_read 开始
                    │
  input_json_delta ──┼──→ "{"
  input_json_delta ──┼──→ "\"pa"
  input_json_delta ──┼──→ "th\":"
  input_json_delta ──┼──→ "\"/sr"
  input_json_delta ──┼──→ "c/age"
  input_json_delta ──┼──→ "nt.ts"
  input_json_delta ──┼──→ "\"}"
                    │
  content_block_stop │
         │           │
         └───────────┘
                    ↓
            完整 JSON: {"path": "/src/agent.ts"}
```

我们用 `toolInputBuffers` Map 按 block index 累积每个工具的 JSON 片段。

### Watchdog 超时

```typescript
const STREAM_IDLE_TIMEOUT = 60_000;

let watchdog = setTimeout(() => stream.abort(), STREAM_IDLE_TIMEOUT);

stream.on("event", () => {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => stream.abort(), STREAM_IDLE_TIMEOUT);
});
```

每收到一个事件就重置计时器。如果 60 秒没有任何事件，abort 流并抛出错误。

### 非流式回退

```typescript
try {
  response = await this.streamTurn(messages, onOutput);
} catch (err) {
  // streaming 失败，降级为 create()
  response = await this.fallbackNonStreaming(messages);
}
```

## 实现

### Agent 核心：streamTurn 方法

```typescript
private async streamTurn(messages, onOutput): Promise<Message> {
  const stream = this.client.messages.stream({ ... });

  // Watchdog
  let watchdog = setTimeout(() => stream.abort(), STREAM_IDLE_TIMEOUT);
  const resetWatchdog = () => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => stream.abort(), STREAM_IDLE_TIMEOUT);
  };

  // 工具 JSON buffer
  const toolInputBuffers = new Map<number, { name: string; json: string }>();

  stream.on("event", (event) => {
    resetWatchdog();
    switch (event.type) {
      case "content_block_start":
        if (event.content_block.type === "thinking")
          onOutput({ type: "thinking_delta", content: "" });
        break;
      case "content_block_delta":
        if (delta.type === "thinking_delta")
          onOutput({ type: "thinking_delta", content: delta.thinking });
        else if (delta.type === "text_delta")
          onOutput({ type: "text_delta", content: delta.text });
        else if (delta.type === "input_json_delta") {
          buf.json += delta.partial_json;
          onOutput({ type: "tool_input_delta", content: delta.partial_json });
        }
        break;
    }
  });

  const finalMessage = await stream.finalMessage();
  clearTimeout(watchdog);
  return finalMessage;
}
```

### REPL 层：Thinking 状态管理

```typescript
const [thinkingText, setThinkingText] = useState<string | undefined>();
const thinkBufRef = useRef("");

case "thinking_delta":
  thinkBufRef.current += out.content;
  setThinkingText(thinkBufRef.current);
  break;
case "text_delta":
  // thinking 结束 → text 开始
  if (thinkBufRef.current) {
    addMessage("thinking", thinkBufRef.current);
    thinkBufRef.current = "";
    setThinkingText(undefined);
  }
  streamBufRef.current += out.content;
  setStreamingText(streamBufRef.current);
  break;
```

### ThinkingMessage 组件

```typescript
function ThinkingMessage({ content, streaming }) {
  const preview = content.length > 120 ? content.slice(-120) + "…" : content;
  return (
    <Box paddingLeft={2} paddingTop={1}>
      <Text color="magenta" dimColor>
        {"💭 "}{preview}{streaming ? "▍" : ""}
      </Text>
    </Box>
  );
}
```

## 验证

```bash
cd agents/s21-advanced-streaming && npx tsx src/cli.tsx
```

1. 发送一个复杂问题 → 观察 💭 thinking 实时显示
2. 发送 "read package.json" → 观察工具 JSON 增量到达
3. 设置 `CLI_PROFILE=1` 观察 watchdog 计时器

## 对照 Claude Code

| 维度 | 教学版 (s21) | Claude Code |
|------|-------------|-------------|
| 流式方式 | SDK `stream()` + event 监听 | raw `Stream<BetaRawMessageStreamEvent>` async generator |
| thinking | 折叠预览最后 120 字符 | ThinkingBlock 组件 + 折叠/展开/耗时显示 |
| 工具 JSON | Map 累积 + 完成时解析 | 同样思路但避开 SDK 的 partialParse |
| 超时处理 | 单一 watchdog | 分层：idle watchdog + stall 日志(>30s) + 总超时 |
| 回退策略 | catch → create() | 可配置 feature flag 禁用回退 + 防止双重工具执行 |
| VCR 录制 | 无 | withStreamingVCR 录制事件流用于测试回放 |

**双重工具执行问题**：在 Claude Code 中，如果 streaming 过程中已经执行了部分工具，然后 streaming 失败并回退到 `create()`，可能会导致工具被执行两次（文件写两次）。生产版通过跟踪已执行工具来避免这个问题。

## 深入思考

1. **为什么 Claude Code 用 async generator 而不是事件回调？** Generator 把"生产者推送"变成"消费者拉取"，更容易组合和取消，也更符合"响应式"编程范式。
2. **VCR 模式的价值**：录制真实 API 流用于测试，不需要每次跑测试都调 API。这是基础设施级别的投资。
3. **thinking 内容的安全性**：thinking 可能包含敏感推理过程。生产环境中需要考虑是否暴露给用户，以及日志中是否脱敏。

## 练习

1. 实现一个 "thinking 折叠/展开" 交互：按 `t` 键切换 thinking 消息的显示模式
2. 给 watchdog 添加一条警告消息：超时前 10 秒显示 "API 响应缓慢..."
3. 实现 VCR 模式的简化版：把所有 stream event 序列化到 JSON 文件
