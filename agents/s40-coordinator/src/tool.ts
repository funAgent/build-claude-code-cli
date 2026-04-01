/**
 * s32 — Tool 接口（新增 checkPermissions）
 *
 * 新增工具级权限检查：每个工具可以实现 checkPermissions 来定义
 * 细粒度的权限逻辑。例如 bash 工具可以根据具体命令决定是否需要询问。
 *
 * 对照 Claude Code: Tool.checkPermissions(parsedInput, context)
 * 生产版每个工具都有自己的 checkPermissions 实现，
 * 返回 allow/deny/ask + 原因。
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { PermissionDecision } from "./permissions.js";

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
  /**
   * 工具级权限检查。返回 allow/deny/ask。
   * 对照 Claude Code: tool.checkPermissions()
   */
  checkPermissions?(input: Record<string, unknown>): PermissionDecision;
  call(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

export function buildTool(c: {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  isConcurrencySafe?: boolean;
  checkPermissions?: (input: Record<string, unknown>) => PermissionDecision;
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
