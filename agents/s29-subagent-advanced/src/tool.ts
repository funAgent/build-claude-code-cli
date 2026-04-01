/**
 * s22 — Tool 接口（新增 isConcurrencySafe）
 *
 * 关键变化：每个工具声明自己是否可以并行执行。
 * - 读操作（glob、grep、file_read、ls）→ 并发安全
 * - 写操作（file_write、file_edit、bash）→ 必须串行
 *
 * 对照 Claude Code: Tool.isConcurrencySafe(input) 方法
 * 生产版根据具体输入判断（如 bash 的 readonly 命令也可并行）
 * 教学版用简单的静态 flag
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
  isConcurrencySafe?: boolean;
  call(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export function buildTool(c: {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  call: (i: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}): Tool {
  return {
    ...c,
    isReadOnly: c.isReadOnly ?? false,
    isConcurrencySafe: c.isConcurrencySafe ?? c.isReadOnly ?? false,
  };
}

export function toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
