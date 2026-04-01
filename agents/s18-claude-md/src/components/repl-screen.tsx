/**
 * s16 — REPL 主屏组件
 *
 * 将 Welcome + MessageList + Spinner + PromptInput + StatusBar 组装成
 * 完整的交互式 REPL 界面。这是 CLI 产品的"主界面"。
 *
 * 关键设计：
 * 1. useStdout 获取终端尺寸用于自适应布局
 * 2. 内置命令系统（/help /clear /tools /exit）
 * 3. Agent 运行时锁定输入 + 显示 Spinner
 * 4. 状态栏实时反映 messageCount 和运行状态
 *
 * 对照 Claude Code: screens/REPL.tsx（5000+ 行）
 * 生产版还包含：权限请求 UI、MCP 管理、团队协作、
 * 沙盒提示、全屏模式、VoiceInput 等
 * 教学版提取组装模式的核心：组件组合 + 命令路由
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
  const agentRef = useRef(new Agent());
  const _termWidth = stdout?.columns ?? 80;

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
          addMessage(
            "assistant",
            "可用工具: glob, grep, ls, file_read, file_write, file_edit, bash, task, help",
          );
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
      try {
        await agentRef.current.run(text, (out: AgentOutput) => {
          addMessage(out.type, out.content);
        });
      } catch (err) {
        addMessage("assistant", `Error: ${err instanceof Error ? err.message : err}`);
      }
      setRunning(false);
    },
    [addMessage, handleCommand, showWelcome],
  );

  return (
    <Box flexDirection="column">
      {/* 欢迎页（首次显示，发送第一条消息后消失） */}
      {showWelcome && <Welcome cwd={process.cwd()} />}

      {/* 消息列表 */}
      {!showWelcome && (
        <Box flexDirection="column" paddingX={1}>
          <MessageList messages={messages} />
        </Box>
      )}

      {/* Spinner */}
      {running && (
        <Box paddingLeft={3} paddingY={1}>
          <Spinner label="thinking" />
        </Box>
      )}

      {/* 输入框 */}
      <Box paddingX={1} marginTop={showWelcome ? 0 : 1}>
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
