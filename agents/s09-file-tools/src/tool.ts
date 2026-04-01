/**
 * Tool 接口（复用 s08 定义）
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface ToolContext {
  cwd: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  call(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export function buildTool(config: {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  call: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}): Tool {
  return { ...config, isReadOnly: config.isReadOnly ?? false };
}

export function toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
