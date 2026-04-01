/**
 * s29 — 子 Agent 工具限制与深度控制
 *
 * 核心原则：子 Agent 的能力必须小于父 Agent——权力越大，风险越大。
 *
 * 1. filterToolsForAgent: 子 Agent 的工具集 ⊂ 父 Agent
 * 2. 递归深度控制: 防止 Agent 无限创建子 Agent
 * 3. 生命周期清理: 子 Agent 结束后清理 todo、shell 进程等资源
 *
 * 对照 Claude Code: tools/AgentTool/agentToolUtils.ts
 * - filterToolsForAgent: 按 agent 类型过滤
 * - ALL_AGENT_DISALLOWED_TOOLS: 子 Agent 禁用的工具列表
 * - ASYNC_AGENT_ALLOWED_TOOLS: 异步 Agent 的白名单
 */

import type { Tool } from "./tool.js";
import { clearTodos } from "./todo.js";

// ── 工具过滤 ─────────────────────────────────────────────────

// 子 Agent 禁止使用的工具（防止递归和危险操作）
// 对照 Claude Code: ALL_AGENT_DISALLOWED_TOOLS
const DISALLOWED_TOOLS = new Set([
  "agent",       // 防止无限递归创建子 Agent
  "help",        // 子 Agent 不需要帮助命令
]);

// 只读子 Agent 允许的工具（安全子集）
const READONLY_TOOLS = new Set([
  "glob", "grep", "ls", "file_read", "todo_write",
]);

/**
 * 为子 Agent 过滤工具集。
 *
 * 子 Agent 的工具集严格是父 Agent 的子集。
 * 过滤策略取决于子 Agent 的权限级别。
 *
 * 对照 Claude Code: filterToolsForAgent()
 * - 始终允许 mcp__ 前缀的工具
 * - 按 ALL_AGENT_DISALLOWED_TOOLS 禁止危险工具
 * - async agent 只允许 ASYNC_AGENT_ALLOWED_TOOLS 白名单
 */
export function filterToolsForAgent(
  tools: Tool[],
  options: { readOnly?: boolean } = {},
): Tool[] {
  return tools.filter((tool) => {
    // 禁止列表中的工具一律不给子 Agent
    if (DISALLOWED_TOOLS.has(tool.name)) return false;

    // 只读模式下只给读操作工具
    if (options.readOnly) {
      return READONLY_TOOLS.has(tool.name);
    }

    return true;
  });
}

// ── 递归深度控制 ──────────────────────────────────────────────

// 最大递归深度
// 对照 Claude Code: 深度通过 queryTracking.depth 追踪
const MAX_DEPTH = 3;

/**
 * 检查是否允许创建子 Agent（深度限制）。
 */
export function canCreateSubagent(currentDepth: number): {
  allowed: boolean;
  reason?: string;
} {
  if (currentDepth >= MAX_DEPTH) {
    return {
      allowed: false,
      reason: `已达到最大递归深度 (${MAX_DEPTH})。子 Agent 不能再创建子 Agent。`,
    };
  }
  return { allowed: true };
}

// ── 生命周期清理 ──────────────────────────────────────────────

/**
 * 清理子 Agent 的资源。
 *
 * 对照 Claude Code: runAgent() 的 finally 块
 * - MCP 清理: killMonitorMcpTasksForAgent
 * - Shell 清理: killShellTasksForAgent
 * - Todo 清理: 删除 agentId 对应的 todo 列表
 * - ReadFileState 清理: readFileState.clear()
 */
export function cleanupSubagent(agentId: string): void {
  // 清理子 Agent 的 todo 列表
  clearTodos(agentId);

  // 教学版简化：生产版还会清理 MCP 连接、shell 进程等
}

/**
 * 获取最大递归深度配置。
 */
export function getMaxDepth(): number {
  return MAX_DEPTH;
}
