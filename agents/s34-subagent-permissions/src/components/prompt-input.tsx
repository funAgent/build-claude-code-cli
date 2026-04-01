/**
 * s15 — PromptInput 组件
 *
 * 专业的输入框组件，支持：
 * - 基础文本输入（useInput 捕获按键）
 * - 输入历史（↑/↓ 浏览）
 * - 提交回调（Enter）
 * - 禁用状态（Agent 运行时锁定输入）
 *
 * 对照 Claude Code: components/PromptInput/PromptInput.tsx
 * 生产版还有：多行编辑、Vim 模式、命令队列、粘贴处理、
 * 语音输入、Tab 补全、Help 菜单
 * 教学版聚焦最核心的三件事：输入 + 历史 + 禁用
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";

export function PromptInput({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}): React.ReactElement {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const submit = useCallback(
    (text: string) => {
      setHistory((prev) => [...prev, text]);
      setHistoryIndex(-1);
      setInput("");
      onSubmit(text);
    },
    [onSubmit],
  );

  useInput((ch, key) => {
    if (disabled) return;

    if (key.return && input.trim()) {
      submit(input);
      return;
    }

    if (key.upArrow) {
      if (history.length === 0) return;
      const newIdx =
        historyIndex === -1
          ? history.length - 1
          : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIdx);
      setInput(history[newIdx]);
      return;
    }

    if (key.downArrow) {
      if (historyIndex === -1) return;
      const newIdx = historyIndex + 1;
      if (newIdx >= history.length) {
        setHistoryIndex(-1);
        setInput("");
      } else {
        setHistoryIndex(newIdx);
        setInput(history[newIdx]);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setInput((prev) => prev.slice(0, -1));
      setHistoryIndex(-1);
      return;
    }

    if (ch && !key.ctrl && !key.meta) {
      setInput((prev) => prev + ch);
      setHistoryIndex(-1);
    }
  });

  return (
    <Box>
      <Text color={disabled ? "gray" : "green"} bold>
        {"❯ "}
      </Text>
      <Text dimColor={disabled}>{input}</Text>
      {!disabled && <Text color="gray">█</Text>}
    </Box>
  );
}
