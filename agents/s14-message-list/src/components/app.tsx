/**
 * s14 — Ink App（使用 MessageList 组件）
 *
 * 相比 s13 的变化：
 * - 消息渲染从 App 中拆出到独立的 MessageList
 * - 不同消息类型（user/assistant/tool）有专属视觉组件
 * - 代码块被识别并高亮渲染
 *
 * 对照 Claude Code: REPL.tsx 组装 Messages + PromptInput
 */

import React, { useState, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Agent, type AgentOutput } from "../agent.js";
import { MessageList, type Message } from "./message-list.js";

let msgId = 0;

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const agentRef = useRef(new Agent());

  const addMessage = useCallback(
    (type: Message["type"], content: string) => {
      setMessages((prev) => [
        ...prev,
        { id: ++msgId, type, content, timestamp: Date.now() },
      ]);
    },
    [],
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      addMessage("user", text);
      setRunning(true);
      try {
        await agentRef.current.run(text, (out: AgentOutput) => {
          addMessage(out.type, out.content);
        });
      } catch (err) {
        addMessage("assistant", `Error: ${err instanceof Error ? err.message : err}`);
      }
      setRunning(false);
    },
    [addMessage],
  );

  useInput((ch, key) => {
    if (running) return;
    if (key.return && input.trim()) {
      const text = input;
      setInput("");
      handleSubmit(text);
    } else if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
    } else if (key.escape) {
      exit();
    } else if (ch && !key.ctrl && !key.meta) {
      setInput((prev) => prev + ch);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          mycli v0.14.0
        </Text>
        <Text> [Message List] </Text>
        <Text dimColor>ESC 退出</Text>
      </Box>

      <MessageList messages={messages} />

      {running && (
        <Box paddingLeft={2}>
          <Text color="yellow">⏳ thinking…</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color="green" bold>
          {"❯ "}
        </Text>
        <Text>{input}</Text>
        {!running && <Text color="gray">█</Text>}
      </Box>
    </Box>
  );
}
