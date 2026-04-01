/**
 * s15 — StatusBar 组件
 *
 * 底部状态栏，显示当前模型、消息数、快捷键提示。
 *
 * 对照 Claude Code: 没有独立 StatusBar，
 * 状态信息分散在 PromptInputFooter + StatusNotices 中。
 * 教学版提取为单一组件，更清晰。
 */

import React from "react";
import { Box, Text } from "ink";

export function StatusBar({
  messageCount,
  model,
  isRunning,
}: {
  messageCount: number;
  model: string;
  isRunning: boolean;
}): React.ReactElement {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text dimColor>
        {model} │ {messageCount} msgs
      </Text>
      <Text dimColor>
        {isRunning ? "⏳ running" : "↑↓ history │ Enter send │ ESC quit"}
      </Text>
    </Box>
  );
}
