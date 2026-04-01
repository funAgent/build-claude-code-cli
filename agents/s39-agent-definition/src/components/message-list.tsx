/**
 * s21 — MessageList 组件（支持 thinking + 工具流式）
 *
 * 对比 s20：
 * - 新增 "thinking" 消息类型，折叠显示 AI 的思考过程
 * - 新增 "tool_start" 类型，工具开始执行时显示占位
 * - tool_input_delta 展示工具参数的流式拼接
 *
 * 对照 Claude Code: components/messages/ThinkingBlock.tsx
 * 生产版的 thinking 有折叠/展开、字数统计、耗时显示
 * 教学版用 dimColor 简化呈现
 */

import React from "react";
import { Box, Text } from "ink";

export interface Message {
  id: number;
  type: "user" | "assistant" | "tool_call" | "tool_result" | "thinking";
  content: string;
  timestamp: number;
}

export function MessageList({
  messages,
  streamingText,
  thinkingText,
}: {
  messages: Message[];
  streamingText?: string;
  thinkingText?: string;
}): React.ReactElement {
  if (messages.length === 0 && !streamingText && !thinkingText) {
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
      {thinkingText !== undefined && thinkingText.length > 0 && (
        <ThinkingMessage content={thinkingText} streaming />
      )}
      {streamingText !== undefined && streamingText.length > 0 && (
        <StreamingMessage content={streamingText} />
      )}
    </Box>
  );
}

function MessageRow({ message }: { message: Message }): React.ReactElement {
  switch (message.type) {
    case "user":
      return <UserMessage content={message.content} />;
    case "assistant":
      return <AssistantMessage content={message.content} />;
    case "tool_call":
      return <ToolCallMessage content={message.content} />;
    case "tool_result":
      return <ToolResultMessage content={message.content} />;
    case "thinking":
      return <ThinkingMessage content={message.content} />;
    default:
      return <Text>{message.content}</Text>;
  }
}

function UserMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box paddingTop={1}>
      <Text color="green" bold>{"❯ "}</Text>
      <Text color="green" bold wrap="wrap">{content}</Text>
    </Box>
  );
}

function AssistantMessage({ content }: { content: string }): React.ReactElement {
  const parts = parseCodeBlocks(content);
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      {parts.map((part, i) =>
        part.isCode ? (
          <Box key={i} borderStyle="single" borderColor="gray" paddingX={1} marginY={1}>
            <Text color="cyan">{part.text}</Text>
          </Box>
        ) : (
          <Text key={i} wrap="wrap">{part.text}</Text>
        ),
      )}
    </Box>
  );
}

function StreamingMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text wrap="wrap">{content}<Text dimColor>▍</Text></Text>
    </Box>
  );
}

function ThinkingMessage({ content, streaming }: { content: string; streaming?: boolean }): React.ReactElement {
  const preview = content.length > 120 ? content.slice(-120) + "…" : content;
  return (
    <Box paddingLeft={2} paddingTop={1}>
      <Text color="magenta" dimColor>
        {"💭 "}{preview}{streaming ? "▍" : ""}
      </Text>
    </Box>
  );
}

function ToolCallMessage({ content }: { content: string }): React.ReactElement {
  return (
    <Box paddingLeft={2}>
      <Text color="yellow">{"⚡ "}</Text>
      <Text color="yellow" dimColor wrap="wrap">{content}</Text>
    </Box>
  );
}

function ToolResultMessage({ content }: { content: string }): React.ReactElement {
  const lines = content.split("\n");
  const display = lines.length > 5 ? [...lines.slice(0, 5), `… (+${lines.length - 5} lines)`] : lines;
  return (
    <Box paddingLeft={4} flexDirection="column">
      <Text dimColor>{"← "}{display.join("\n")}</Text>
    </Box>
  );
}

interface TextPart { text: string; isCode: boolean }

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
