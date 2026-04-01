/**
 * s16 — Welcome 欢迎页
 *
 * 启动时显示品牌信息、版本号、工作目录、快捷键提示。
 * 给用户一个"这是专业工具"的第一印象。
 *
 * 对照 Claude Code: LogoV2 组件 + StatusNotices
 * 生产版还会检测登录状态、显示 model 信息、检查更新
 */

import React from "react";
import { Box, Text } from "ink";
import * as path from "node:path";

export function Welcome({
  cwd,
}: {
  cwd: string;
}): React.ReactElement {
  const dirName = path.basename(cwd);
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text bold color="cyan">
        ╭─────────────────────────────────╮
      </Text>
      <Text bold color="cyan">
        │     mycli v0.16.0  (REPL)       │
      </Text>
      <Text bold color="cyan">
        ╰─────────────────────────────────╯
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text dimColor>📁 </Text>
          <Text>{dirName}/</Text>
          <Text dimColor> — {cwd}</Text>
        </Text>
        <Text>
          <Text dimColor>🤖 </Text>
          <Text>claude-sonnet-4 │ 9 tools</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Enter 发送 │ ↑↓ 历史 │ /help 帮助 │ ESC 退出
        </Text>
      </Box>
    </Box>
  );
}
