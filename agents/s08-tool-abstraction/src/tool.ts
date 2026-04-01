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

// Tool 接口的三要素：name + schema + call
// 这三个属性完全对应 Anthropic API 的 Tool 结构：
//   name → tools[].name
//   description + inputSchema → tools[].description + tools[].input_schema
//   call → 本地执行逻辑（API 只负责"决定调用"，执行在客户端）
export interface Tool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  // isReadOnly 标记：读工具可以在沙盒/只读模式下使用
  // 后续 s22 中还会扩展为 isConcurrencySafe 用于并行执行
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

// 将内部 Tool[] 转为 API 需要的 tools 参数
// 关键点：API 的 Tool 格式只有 name/description/input_schema
// call 方法不发给 API——它在本地执行
export function toAnthropicTools(tools: Tool[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
