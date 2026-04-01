/**
 * s42 — Team Protocols
 *
 * 多 Agent 系统的稳定性取决于协议设计，不是 Agent 智能。
 * 没有协议，Agent 之间就会混乱。
 *
 * 关键协议：
 * 1. 权限同步 — Worker 请求权限 → Leader 审批
 * 2. 计划审批 — Worker 提出计划 → Leader 批准/拒绝
 * 3. 关闭协议 — Worker 完成后的优雅退出
 * 4. FSM 状态机 — 协议执行的状态追踪
 *
 * 对照 Claude Code:
 * - utils/swarm/permissionSync.ts (~300 行)
 * - teammateMailbox.ts 中的协议消息类型
 * - PermissionRequestMessage / PlanApprovalRequest / ShutdownRequest
 */

import { writeToMailbox, readUnreadMessages, type TeammateMessage } from "./team-mailbox.js";

// ── 类型定义 ─────────────────────────────────────────────────

export type ProtocolType =
  | "permission_request"
  | "permission_response"
  | "plan_approval_request"
  | "plan_approval_response"
  | "shutdown_request"
  | "shutdown_approved"
  | "task_assignment"
  | "idle_notification";

/**
 * 协议消息基类。
 * 对照 Claude Code: teammateMailbox.ts 中的结构化协议消息
 */
export interface ProtocolMessage {
  protocol: ProtocolType;
  requestId: string;
  payload: Record<string, unknown>;
}

/**
 * 权限请求。
 * 对照 Claude Code: PermissionRequestMessage
 */
export interface PermissionRequest extends ProtocolMessage {
  protocol: "permission_request";
  payload: {
    toolName: string;
    toolInput: string;
    reason: string;
  };
}

/**
 * 权限响应。
 * 对照 Claude Code: PermissionResponseMessage
 */
export interface PermissionResponse extends ProtocolMessage {
  protocol: "permission_response";
  payload: {
    approved: boolean;
    message?: string;
  };
}

/**
 * 计划审批请求。
 * 对照 Claude Code: PlanApprovalRequest
 */
export interface PlanApprovalRequest extends ProtocolMessage {
  protocol: "plan_approval_request";
  payload: {
    plan: string;
    steps: string[];
  };
}

/**
 * 关闭请求。
 * 对照 Claude Code: ShutdownRequest
 */
export interface ShutdownRequestMsg extends ProtocolMessage {
  protocol: "shutdown_request";
  payload: {
    reason: string;
    summary: string;
  };
}

// ── 协议判断 ─────────────────────────────────────────────────

/**
 * 判断消息是否为结构化协议消息。
 *
 * 对照 Claude Code: isStructuredProtocolMessage
 * 协议消息不应作为普通对话内容喂给模型。
 */
export function isProtocolMessage(text: string): boolean {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed.protocol === "string" && typeof parsed.requestId === "string";
  } catch {
    return false;
  }
}

export function parseProtocolMessage(text: string): ProtocolMessage | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.protocol === "string" && typeof parsed.requestId === "string") {
      return parsed as ProtocolMessage;
    }
    return null;
  } catch {
    return null;
  }
}

// ── 权限同步协议 ─────────────────────────────────────────────

let requestIdCounter = 0;
function generateRequestId(): string {
  return `req-${Date.now()}-${++requestIdCounter}`;
}

/**
 * Worker 向 Leader 请求权限。
 *
 * 对照 Claude Code: sendPermissionRequestViaMailbox
 * - Worker 发送权限请求到 Leader 邮箱
 * - Leader 审批后发送响应到 Worker 邮箱
 */
export function sendPermissionRequest(
  teamName: string,
  workerName: string,
  leaderName: string,
  toolName: string,
  toolInput: string,
  reason: string,
): string {
  const requestId = generateRequestId();

  const request: PermissionRequest = {
    protocol: "permission_request",
    requestId,
    payload: { toolName, toolInput, reason },
  };

  writeToMailbox(teamName, leaderName, workerName, JSON.stringify(request));
  return requestId;
}

/**
 * Leader 回复权限请求。
 *
 * 对照 Claude Code: sendPermissionResponseViaMailbox
 */
export function sendPermissionResponse(
  teamName: string,
  leaderName: string,
  workerName: string,
  requestId: string,
  approved: boolean,
  message?: string,
): void {
  const response: PermissionResponse = {
    protocol: "permission_response",
    requestId,
    payload: { approved, message },
  };

  writeToMailbox(teamName, workerName, leaderName, JSON.stringify(response));
}

/**
 * Worker 轮询等待权限响应。
 *
 * 对照 Claude Code: pollForResponse
 */
export function pollForPermissionResponse(
  teamName: string,
  workerName: string,
  requestId: string,
): PermissionResponse | null {
  const messages = readUnreadMessages(teamName, workerName);

  for (const msg of messages) {
    const protocol = parseProtocolMessage(msg.text);
    if (
      protocol &&
      protocol.protocol === "permission_response" &&
      protocol.requestId === requestId
    ) {
      return protocol as PermissionResponse;
    }
  }

  return null;
}

// ── 计划审批协议 ─────────────────────────────────────────────

/**
 * Worker 提交计划审批请求。
 * 对照 Claude Code: PlanApprovalRequest
 */
export function sendPlanApproval(
  teamName: string,
  workerName: string,
  leaderName: string,
  plan: string,
  steps: string[],
): string {
  const requestId = generateRequestId();

  const request: PlanApprovalRequest = {
    protocol: "plan_approval_request",
    requestId,
    payload: { plan, steps },
  };

  writeToMailbox(teamName, leaderName, workerName, JSON.stringify(request));
  return requestId;
}

// ── 关闭协议 ─────────────────────────────────────────────────

/**
 * Worker 请求关闭。
 * 对照 Claude Code: ShutdownRequest
 */
export function sendShutdownRequest(
  teamName: string,
  workerName: string,
  leaderName: string,
  reason: string,
  summary: string,
): string {
  const requestId = generateRequestId();

  const request: ShutdownRequestMsg = {
    protocol: "shutdown_request",
    requestId,
    payload: { reason, summary },
  };

  writeToMailbox(teamName, leaderName, workerName, JSON.stringify(request));
  return requestId;
}

// ── 角色判断 ─────────────────────────────────────────────────

/**
 * 判断是否为团队 Leader。
 * 对照 Claude Code: isTeamLeader
 */
export function isTeamLeader(agentId?: string): boolean {
  return !agentId || agentId === "team-lead";
}

/**
 * 判断是否为团队 Worker。
 * 对照 Claude Code: isSwarmWorker
 */
export function isSwarmWorker(
  teamName?: string,
  agentId?: string,
): boolean {
  return !!teamName && !!agentId && agentId !== "team-lead";
}
