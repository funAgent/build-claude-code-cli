/**
 * s40 — Coordinator 模式
 *
 * 一个协调者，多个 Worker——分而治之。
 * Coordinator 不直接做事，它只管派活、追踪、汇总。
 *
 * 关键流程：
 * 1. Coordinator 系统提示描述 Worker 可用工具
 * 2. Coordinator 只能用编排工具（Agent、SendMessage、TaskStop）
 * 3. Worker 只能用执行工具（bash、file_read 等）
 * 4. 工具池分裂：编排 vs 执行严格隔离
 *
 * 对照 Claude Code:
 * - coordinator/coordinatorMode.ts (~200 行)
 * - getCoordinatorSystemPrompt: 协调者提示词
 * - getCoordinatorUserContext: Worker 工具描述
 * - COORDINATOR_MODE_ALLOWED_TOOLS / ASYNC_AGENT_ALLOWED_TOOLS
 */

import type { AgentDefinition } from "./agent-definition.js";

// ── 类型定义 ─────────────────────────────────────────────────

export interface CoordinatorConfig {
  enabled: boolean;
  workerTools: string[];
  coordinatorTools: string[];
}

// ── 工具池分裂 ───────────────────────────────────────────────

/**
 * Coordinator 专用工具（编排层）。
 * 对照 Claude Code: COORDINATOR_MODE_ALLOWED_TOOLS
 */
const COORDINATOR_TOOLS = ["agent", "send_message", "task_stop"] as const;

/**
 * Worker 允许的工具（执行层）。
 * 对照 Claude Code: ASYNC_AGENT_ALLOWED_TOOLS
 */
const WORKER_ALLOWED_TOOLS = [
  "bash",
  "file_read",
  "file_write",
  "file_edit",
  "glob",
  "grep",
  "ls",
  "skill",
] as const;

/**
 * 内部工具：不应在 Worker 描述中出现。
 * 对照 Claude Code: INTERNAL_WORKER_TOOLS
 */
const INTERNAL_TOOLS = ["send_message", "task_stop"] as const;

// ── Coordinator 系统提示 ─────────────────────────────────────

/**
 * 生成 Coordinator 的系统提示词。
 *
 * 对照 Claude Code: getCoordinatorSystemPrompt()
 * - 角色：协调者，不直接执行
 * - 用 Agent 工具派活
 * - 用 SendMessage 续聊
 * - 用 TaskStop 停止
 * - 强调并行和自包含 prompt
 */
export function getCoordinatorSystemPrompt(): string {
  return `你是一个任务协调者（Coordinator）。你的职责是分解任务、派发给 Worker Agent、追踪进度、汇总结果。

## 你的能力

你只能使用以下编排工具：
- **agent**: 创建一个 Worker Agent 来执行具体任务
- **send_message**: 给正在运行的 Worker 发送消息
- **task_stop**: 停止一个 Worker

## 规则

1. **不要直接执行** — 你不能用 bash、读写文件等。所有具体工作由 Worker 完成。
2. **并行优先** — 当多个任务互不依赖时，同时启动多个 Worker。
3. **自包含 prompt** — 给 Worker 的任务描述要完整，不要假设它知道上下文。
4. **先分析再派活** — 收到任务后先拆解，再逐一分配。
5. **汇总结果** — 所有 Worker 完成后，综合报告给用户。`;
}

/**
 * 生成 Worker 工具描述上下文（嵌入 Coordinator 系统提示）。
 *
 * 对照 Claude Code: getCoordinatorUserContext()
 * - 列出 Worker 可用的工具
 * - 排除内部工具
 */
export function getWorkerToolsContext(): string {
  const visibleTools = WORKER_ALLOWED_TOOLS.filter(
    (t) => !(INTERNAL_TOOLS as readonly string[]).includes(t),
  );

  return `Worker Agent 可以使用以下工具：${visibleTools.join(", ")}`;
}

// ── 工具池过滤 ───────────────────────────────────────────────

/**
 * 过滤 Coordinator 的工具池（只保留编排工具）。
 *
 * 对照 Claude Code: applyCoordinatorToolFilter in toolPool.ts
 */
export function filterCoordinatorTools(
  allTools: Array<{ name: string }>,
): Array<{ name: string }> {
  return allTools.filter((t) =>
    (COORDINATOR_TOOLS as readonly string[]).includes(t.name),
  );
}

/**
 * 过滤 Worker 的工具池（只保留执行工具）。
 */
export function filterWorkerTools(
  allTools: Array<{ name: string }>,
): Array<{ name: string }> {
  return allTools.filter((t) =>
    (WORKER_ALLOWED_TOOLS as readonly string[]).includes(t.name),
  );
}

// ── Coordinator 模式判断 ─────────────────────────────────────

/**
 * 是否启用 Coordinator 模式。
 * 对照 Claude Code: isCoordinatorMode() → feature flag + env
 */
export function isCoordinatorMode(): boolean {
  return process.env.COORDINATOR_MODE === "true";
}

/**
 * 构建完整的系统提示（根据是否 Coordinator 模式）。
 *
 * 对照 Claude Code: buildEffectiveSystemPrompt
 */
export function buildEffectiveSystemPrompt(
  defaultPrompt: string,
  agentDefinition?: AgentDefinition,
): string {
  if (isCoordinatorMode() && !agentDefinition) {
    return getCoordinatorSystemPrompt() + "\n\n" + getWorkerToolsContext();
  }

  if (agentDefinition) {
    return agentDefinition.systemPrompt;
  }

  return defaultPrompt;
}
