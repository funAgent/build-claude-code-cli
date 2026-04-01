/**
 * s20 — REPL 主屏（流式版）
 *
 * 对比 s16 的关键变化：
 * 1. 引入 streamingText state 来累积 text_delta
 * 2. text_delta 不插入 messages，而是实时拼接到 streamingText
 * 3. text_done 时把完整文本移入 messages，清空 streamingText
 * 4. 用户看到文字逐字流出，而非等待完整响应
 *
 * 对照 Claude Code: screens/REPL.tsx + useStreamingMessage hook
 * 生产版用 StreamingAssistantMessage 组件做细粒度 re-render
 * 教学版用简单的 string state 演示核心"增量拼接"模式
 */

import React, { useState, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import { Agent, type AgentOutput } from "../agent.js";
import { MessageList, type Message } from "./message-list.js";
import { PromptInput } from "./prompt-input.js";
import { Spinner } from "./spinner.js";
import { StatusBar } from "./status-bar.js";
import { Welcome } from "./welcome.js";

let msgId = 0;

export function ReplScreen(): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  // streamingText: 正在流式输出的文本（undefined=无流式, ""=等待首个token）
  const [streamingText, setStreamingText] = useState<string | undefined>();
  const agentRef = useRef(new Agent());
  const _termWidth = stdout?.columns ?? 80;
  // 双轨状态：useRef 保存最新值（避免闭包陷阱），setState 触发 re-render
  // 每个 text_delta 回调中的闭包可能捕获旧的 state 值，
  // 但 ref.current 始终是最新的
  const streamBufRef = useRef("");

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

  const handleCommand = useCallback(
    (cmd: string): boolean => {
      switch (cmd) {
        case "/help":
          addMessage("assistant", "命令: /help 帮助 │ /clear 清屏 │ /tools 工具列表 │ /exit 退出");
          return true;
        case "/clear":
          setMessages([]);
          return true;
        case "/tools":
          addMessage("assistant", "可用工具: glob, grep, ls, file_read, file_write, file_edit, bash, task, help");
          return true;
        case "/exit":
        case "/quit":
          exit();
          return true;
        default:
          return false;
      }
    },
    [addMessage, exit],
  );

  const handleSubmit = useCallback(
    async (text: string) => {
      if (showWelcome) setShowWelcome(false);

      if (text.startsWith("/")) {
        if (handleCommand(text)) return;
      }

      addMessage("user", text);
      setRunning(true);
      streamBufRef.current = "";
      setStreamingText("");

      try {
        await agentRef.current.run(text, (out: AgentOutput) => {
          switch (out.type) {
            case "text_delta":
              streamBufRef.current += out.content;
              setStreamingText(streamBufRef.current);
              break;
            case "text_done":
              if (streamBufRef.current) {
                addMessage("assistant", streamBufRef.current);
              }
              streamBufRef.current = "";
              setStreamingText(undefined);
              break;
            case "tool_call":
              addMessage("tool_call", out.content);
              break;
            case "tool_result":
              addMessage("tool_result", out.content);
              break;
          }
        });
      } catch (err) {
        if (streamBufRef.current) {
          addMessage("assistant", streamBufRef.current);
          streamBufRef.current = "";
          setStreamingText(undefined);
        }
        addMessage("assistant", `Error: ${err instanceof Error ? err.message : err}`);
      }
      setRunning(false);
    },
    [addMessage, handleCommand, showWelcome],
  );

  return (
    <Box flexDirection="column">
      {showWelcome && <Welcome cwd={process.cwd()} />}

      {!showWelcome && (
        <Box flexDirection="column" paddingX={1}>
          <MessageList messages={messages} streamingText={streamingText} />
        </Box>
      )}

      {running && !streamingText && (
        <Box paddingLeft={3} paddingY={1}>
          <Spinner label="thinking" />
        </Box>
      )}

      <Box paddingX={1} marginTop={showWelcome ? 0 : 1}>
        <PromptInput onSubmit={handleSubmit} disabled={running} />
      </Box>

      <StatusBar
        messageCount={messages.length}
        model="claude-sonnet-4"
        isRunning={running}
      />
    </Box>
  );
}
