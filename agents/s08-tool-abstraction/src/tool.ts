/**
 * s08 — Tool 接口抽象
 *
 * 定义工具的标准三元组：name + schema + call
 * 循环（agent.ts）只依赖这个接口，不关心工具细节。
 *
 * 对照 Claude Code: Tool.ts
 * 生产版有更复杂的类型系统：
 * - isReadOnly / needsPermissions / isConcurrencySafe 标记
 * - ToolUseContext 注入（abort signal、cwd、permissions）
 * - userFacingName / prompt 方法
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface ToolResult {
  output: string;
  isError?: boolean;
}

export interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  call(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/**
 * 工厂函数：简化 Tool 创建
 *
 * 对照 Claude Code 的 buildTool / defineTool 模式
 */
export function buildTool(config: {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  call: (input: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}): Tool {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    isReadOnly: config.isReadOnly ?? false,
    call: config.call,
  };
}

/**
 * 将 Tool[] 转为 Anthropic API 需要的 tools 参数
 */
export function toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
