/**
 * s28 — 子 Agent 上下文隔离
 *
 * 子 Agent 共享文件系统但不共享对话历史——隔离的是记忆，不是环境。
 *
 * 关键设计：
 * 1. 独立 agentId — 子 Agent 有自己的身份标识
 * 2. 独立 messages — 不继承父 Agent 的对话历史
 * 3. 共享 cwd — 访问同一个文件系统
 * 4. abort 控制 — 同步子 Agent 与父 Agent 共享 abort，异步子 Agent 独立
 *
 * 对照 Claude Code: utils/forkedAgent.ts — createSubagentContext()
 * 生产版还有 queryTracking、contentReplacementState、
 * readFileState 克隆、MCP 初始化等。
 */

import { randomUUID } from "crypto";

/**
 * 子 Agent 上下文。
 * 对照 Claude Code: ToolUseContext 的子集
 */
export interface SubagentContext {
  agentId: string;
  parentAgentId: string;
  cwd: string;
  abortController: AbortController;
  depth: number;
}

/**
 * 创建子 Agent 上下文。
 *
 * 对照 Claude Code: createSubagentContext()
 * - agentId: createAgentId() 生成唯一标识
 * - abortController: 异步子 Agent 用独立 controller，同步子 Agent 共享父级
 * - depth: queryTracking.depth 递增
 */
export function createSubagentContext(options: {
  parentAgentId: string;
  parentCwd: string;
  parentAbortController: AbortController;
  isAsync?: boolean;
  parentDepth?: number;
}): SubagentContext {
  const agentId = `agent_${randomUUID().slice(0, 8)}`;

  // 同步子 Agent 共享父级的 abort controller（父取消则子也取消）
  // 异步子 Agent 用独立的 controller（独立生命周期）
  // 对照 Claude Code: isAsync ? new AbortController() : toolUseContext.abortController
  const abortController = options.isAsync
    ? new AbortController()
    : options.parentAbortController;

  return {
    agentId,
    parentAgentId: options.parentAgentId,
    cwd: options.parentCwd,
    abortController,
    depth: (options.parentDepth ?? 0) + 1,
  };
}

/**
 * 生成子 Agent 的系统提示（比父 Agent 更聚焦）。
 */
export function getSubagentSystemPrompt(task: string): string {
  return [
    "你是一个专注执行子任务的 Agent。",
    "",
    `你的任务: ${task}`,
    "",
    "规则:",
    "- 只完成指定的任务，不要扩展范围",
    "- 完成后立即返回结果",
    "- 如果遇到困难，报告问题而不是猜测",
  ].join("\n");
}
