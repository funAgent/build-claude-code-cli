/**
 * s15 — Ink App（使用 PromptInput + Spinner + StatusBar）
 *
 * 相比 s14：
 * - 输入框拆成独立 PromptInput 组件（含历史记录）
 * - 加载动画拆成 Spinner 组件（帧动画）
 * - 底部增加 StatusBar（模型/消息数/快捷键）
 * - ESC 退出移入 App 层
 *
 * 对照 Claude Code: REPL.tsx 将 PromptInput + Messages + Spinner 组装
 */

import React, { useState, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Agent, type AgentOutput } from "../agent.js";
import { MessageList, type Message } from "./message-list.js";
import { PromptInput } from "./prompt-input.js";
import { Spinner } from "./spinner.js";
import { StatusBar } from "./status-bar.js";

let msgId = 0;

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const agentRef = useRef(new Agent());

  useInput((_ch, key) => {
    if (key.escape) exit();
  });

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

  return (
    <Box flexDirection="column" padding={1}>
      {/* 标题 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          mycli v0.15.0
        </Text>
        <Text> [Input Box] </Text>
      </Box>

      {/* 消息列表 */}
      <MessageList messages={messages} />

      {/* Spinner */}
      {running && (
        <Box paddingLeft={2} paddingY={1}>
          <Spinner label="thinking" />
        </Box>
      )}

      {/* 输入框 */}
      <Box marginTop={1}>
        <PromptInput onSubmit={handleSubmit} disabled={running} />
      </Box>

      {/* 状态栏 */}
      <StatusBar
        messageCount={messages.length}
        model="claude-sonnet-4"
        isRunning={running}
      />
    </Box>
  );
}
