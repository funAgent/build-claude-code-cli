/**
 * s33 — 权限审批对话框（Ink 组件）
 *
 * 当权限引擎返回 ask 时，暂停工具执行，弹出审批 UI：
 * - 展示工具名称和操作预览
 * - 提供 Allow / Deny / Always Allow 三个选项
 * - "Always Allow" 写入 session 规则，后续同类操作不再询问
 *
 * 对照 Claude Code: components/permissions/PermissionPrompt.tsx
 * 生产版有工具专属 UI（BashPermissionRequest 显示命令、
 * FileEditPermissionRequest 显示 diff 预览等）。
 * 教学版用通用的文本预览。
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PermissionDecision, PermissionRule } from "../permissions.js";

export type PermissionChoice = "allow" | "deny" | "always_allow";

interface PermissionPromptProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: PermissionDecision;
  onChoice: (choice: PermissionChoice) => void;
}

/**
 * 获取工具操作的预览文本。
 * 对照 Claude Code: 每个 PermissionRequest 组件有自己的预览逻辑
 */
function getPreview(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case "bash":
      return `$ ${(input.command as string) ?? ""}`;
    case "file_write":
      return `写入文件: ${(input.path as string) ?? ""}`;
    case "file_edit":
      return `编辑文件: ${(input.path as string) ?? ""}`;
    default:
      return JSON.stringify(input).slice(0, 100);
  }
}

export function PermissionPrompt({
  toolName,
  toolInput,
  decision,
  onChoice,
}: PermissionPromptProps) {
  const [selected, setSelected] = useState(0);
  const options: { label: string; value: PermissionChoice }[] = [
    { label: "Allow (本次允许)", value: "allow" },
    { label: "Deny (拒绝)", value: "deny" },
    { label: "Always Allow (始终允许此工具)", value: "always_allow" },
  ];

  useInput((_input, key) => {
    if (key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (key.downArrow) setSelected((s) => Math.min(options.length - 1, s + 1));
    if (key.return) onChoice(options[selected].value);
  });

  const preview = getPreview(toolName, toolInput);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
    >
      <Text bold color="yellow">
        🔒 需要权限确认
      </Text>
      <Box marginTop={1}>
        <Text>
          工具: <Text bold>{toolName}</Text>
        </Text>
      </Box>
      <Box>
        <Text dimColor>{preview}</Text>
      </Box>
      {decision.message && (
        <Box>
          <Text color="gray">原因: {decision.message}</Text>
        </Box>
      )}
      <Box marginTop={1} flexDirection="column">
        {options.map((opt, i) => (
          <Box key={opt.value}>
            <Text color={i === selected ? "cyan" : "white"}>
              {i === selected ? "❯ " : "  "}
              {opt.label}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
