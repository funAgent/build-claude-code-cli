/**
 * s13 — Ink App 组件
 *
 * 用 React 组件渲染终端 UI，替代 console.log。
 *
 * 核心概念：
 * - Box = HTML 的 div（Flexbox 布局）
 * - Text = HTML 的 span（文本样式）
 * - useState 驱动重渲染，和 Web React 完全一致
 * - useInput 捕获键盘事件
 *
 * 对照 Claude Code: ink.ts 的 render() 包装 + ThemeProvider
 */

import React, { useState, useRef, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import { Agent, type AgentOutput } from "../agent.js";

interface Line {
  id: number;
  type: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
}

let lineId = 0;

export function App(): React.ReactElement {
  const { exit } = useApp();
  const [lines, setLines] = useState<Line[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const agentRef = useRef(new Agent());

  const addLine = useCallback((type: Line["type"], content: string) => {
    setLines((prev) => [...prev, { id: ++lineId, type, content }]);
  }, []);

  const handleSubmit = useCallback(
    async (text: string) => {
      addLine("user", text);
      setRunning(true);
      try {
        await agentRef.current.run(text, (out: AgentOutput) => {
          addLine(out.type, out.content);
        });
      } catch (err) {
        addLine("assistant", `Error: ${err instanceof Error ? err.message : err}`);
      }
      setRunning(false);
    },
    [addLine],
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
      {/* 标题栏 */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          mycli v0.13.0
        </Text>
        <Text> [Ink Basics] </Text>
        <Text dimColor>ESC 退出</Text>
      </Box>

      {/* 消息列表 */}
      {lines.map((line) => (
        <MessageLine key={line.id} line={line} />
      ))}

      {/* 加载指示器 */}
      {running && (
        <Box>
          <Text color="yellow">⏳ thinking…</Text>
        </Box>
      )}

      {/* 输入行 */}
      <Box>
        <Text color="green" bold>
          {"you> "}
        </Text>
        <Text>{input}</Text>
        {!running && <Text color="gray">█</Text>}
      </Box>
    </Box>
  );
}

function MessageLine({ line }: { line: Line }): React.ReactElement {
  const colorMap: Record<Line["type"], string> = {
    user: "green",
    assistant: "white",
    tool_call: "yellow",
    tool_result: "gray",
  };
  const prefixMap: Record<Line["type"], string> = {
    user: "you> ",
    assistant: "assistant> ",
    tool_call: "  ⚡ ",
    tool_result: "  ← ",
  };
  return (
    <Box>
      <Text color={colorMap[line.type]} bold={line.type === "user"}>
        {prefixMap[line.type]}
      </Text>
      <Text wrap="wrap">{line.content}</Text>
    </Box>
  );
}
