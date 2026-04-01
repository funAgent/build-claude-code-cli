/**
 * s21 — REPL 主屏（进阶流式版）
 *
 * 对比 s20：
 * 1. 新增 thinkingText state 来累积 thinking_delta
 * 2. thinking 完成后保存为 "thinking" 消息
 * 3. tool_start / tool_input_delta 提供更细粒度的工具执行反馈
 * 4. 非流式回退时也能正常显示
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
  const [streamingText, setStreamingText] = useState<string | undefined>();
  const [thinkingText, setThinkingText] = useState<string | undefined>();
  const agentRef = useRef(new Agent());
  const _termWidth = stdout?.columns ?? 80;
  const streamBufRef = useRef("");
  const thinkBufRef = useRef("");

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
      thinkBufRef.current = "";
      setStreamingText("");
      setThinkingText(undefined);

      try {
        await agentRef.current.run(text, (out: AgentOutput) => {
          switch (out.type) {
            case "thinking_delta":
              thinkBufRef.current += out.content;
              setThinkingText(thinkBufRef.current);
              break;
            case "thinking_done":
              if (thinkBufRef.current) {
                addMessage("thinking", thinkBufRef.current);
              }
              thinkBufRef.current = "";
              setThinkingText(undefined);
              break;
            case "text_delta":
              if (thinkBufRef.current) {
                addMessage("thinking", thinkBufRef.current);
                thinkBufRef.current = "";
                setThinkingText(undefined);
              }
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
            case "tool_start":
              if (streamBufRef.current) {
                addMessage("assistant", streamBufRef.current);
                streamBufRef.current = "";
                setStreamingText(undefined);
              }
              break;
            case "tool_input_delta":
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
          <MessageList
            messages={messages}
            streamingText={streamingText}
            thinkingText={thinkingText}
          />
        </Box>
      )}

      {running && !streamingText && !thinkingText && (
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
