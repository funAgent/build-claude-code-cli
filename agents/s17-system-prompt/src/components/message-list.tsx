/**
 * s14 — MessageList 组件
 *
 * 将结构化消息渲染为可视化对话列表。
 * 不同消息类型有不同的视觉呈现：
 * - user: 绿色粗体，带 "you>" 前缀
 * - assistant: 白色，带代码块检测和 Markdown 渲染
 * - tool_call: 黄色，显示工具名和参数
 * - tool_result: 灰色边框，显示结果摘要
 *
 * 对照 Claude Code: components/Messages.tsx + MessageRow.js
 * 生产版有虚拟滚动(VirtualMessageList)、memo 优化、离屏冻结
 * 教学版用简单的 map 渲染，聚焦"类型→视觉映射"的核心理念
 */

import React from "react";
import { Box, Text } from "ink";

export interface Message {
  id: number;
  type: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  timestamp: number;
}

export function MessageList({
  messages,
}: {
  messages: Message[];
}): React.ReactElement {
  if (messages.length === 0) {
    return (
      <Box paddingY={1}>
        <Text dimColor>输入问题开始对话…</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {messages.map((msg) => (
        <MessageRow key={msg.id} message={msg} />
      ))}
    </Box>
  );
}

function MessageRow({
  message,
}: {
  message: Message;
}): React.ReactElement {
  switch (message.type) {
    case "user":
      return <UserMessage content={message.content} />;
    case "assistant":
      return <AssistantMessage content={message.content} />;
    case "tool_call":
      return <ToolCallMessage content={message.content} />;
    case "tool_result":
      return <ToolResultMessage content={message.content} />;
  }
}

function UserMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box paddingTop={1}>
      <Text color="green" bold>
        {"❯ "}
      </Text>
      <Text color="green" bold wrap="wrap">
        {content}
      </Text>
    </Box>
  );
}

function AssistantMessage({
  content,
}: {
  content: string;
}): React.ReactElement {
  const parts = parseCodeBlocks(content);
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      {parts.map((part, i) =>
        part.isCode ? (
          <Box
            key={i}
            borderStyle="single"
            borderColor="gray"
            paddingX={1}
            marginY={1}
          >
            <Text color="cyan">{part.text}</Text>
          </Box>
        ) : (
          <Text key={i} wrap="wrap">
            {part.text}
          </Text>
        ),
      )}
    </Box>
  );
}

function ToolCallMessage({
  content,
}: {
  content: string;
}): React.ReactElement {
  return (
    <Box paddingLeft={2}>
      <Text color="yellow">{"⚡ "}</Text>
      <Text color="yellow" dimColor wrap="wrap">
        {content}
      </Text>
    </Box>
  );
}

function ToolResultMessage({
  content,
}: {
  content: string;
}): React.ReactElement {
  const lines = content.split("\n");
  const display = lines.length > 5 ? [...lines.slice(0, 5), `… (+${lines.length - 5} lines)`] : lines;
  return (
    <Box paddingLeft={4} flexDirection="column">
      <Text dimColor>{"← "}{display.join("\n")}</Text>
    </Box>
  );
}

interface TextPart {
  text: string;
  isCode: boolean;
}

function parseCodeBlocks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const regex = /```[\w]*\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index).trim(), isCode: false });
    }
    parts.push({ text: match[1].trim(), isCode: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    const remaining = text.slice(last).trim();
    if (remaining) parts.push({ text: remaining, isCode: false });
  }
  if (parts.length === 0) parts.push({ text, isCode: false });
  return parts;
}
