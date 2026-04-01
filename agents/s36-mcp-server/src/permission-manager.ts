/**
 * s33 — 权限管理器
 *
 * 将权限引擎（s32）与 Agent Loop 集成：
 * - 在工具执行前调用 hasPermissionsToUseTool
 * - ask 时暂停执行，通过回调通知 UI 层
 * - 用户批准后恢复执行
 * - "Always Allow" 写入 session 规则
 *
 * 对照 Claude Code: query.ts 中的权限检查流程
 * - 调用 hasPermissionsToUseTool
 * - ask → 挂起工具执行 → 渲染 PermissionRequest 组件
 * - 用户操作 → onAllow/onReject → 恢复/中止工具执行
 */

import {
  hasPermissionsToUseTool,
  applyModePolicy,
  addRule,
  type PermissionContext,
  type PermissionDecision,
  type PermissionRule,
} from "./permissions.js";
import type { Tool } from "./tool.js";

export type PermissionChoice = "allow" | "deny" | "always_allow";

/**
 * 权限请求事件（传递给 UI 层）
 */
export interface PermissionRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: PermissionDecision;
  resolve: (choice: PermissionChoice) => void;
}

/**
 * 权限管理器。
 * 封装权限检查和用户交互的完整流程。
 */
export class PermissionManager {
  private ctx: PermissionContext;
  private onPermissionRequest?: (req: PermissionRequest) => void;

  constructor(
    ctx: PermissionContext,
    onPermissionRequest?: (req: PermissionRequest) => void,
  ) {
    this.ctx = ctx;
    this.onPermissionRequest = onPermissionRequest;
  }

  /**
   * 检查工具执行权限。
   *
   * 返回 true 表示允许执行，false 表示拒绝。
   * ask 时会挂起当前执行，等待用户响应。
   */
  async checkPermission(
    tool: Tool,
    input: Record<string, unknown>,
  ): Promise<{ allowed: boolean; message?: string }> {
    // 调用权限引擎
    let decision = hasPermissionsToUseTool(
      tool.name,
      input,
      this.ctx,
      tool.checkPermissions?.bind(tool),
    );

    // 应用模式策略（dontAsk → deny）
    decision = applyModePolicy(decision, this.ctx.mode);

    switch (decision.behavior) {
      case "allow":
        return { allowed: true };

      case "deny":
        return { allowed: false, message: decision.message };

      case "ask": {
        // 如果没有 UI 回调，默认拒绝
        if (!this.onPermissionRequest) {
          return { allowed: false, message: "无交互 UI，ask 自动拒绝" };
        }

        // 挂起执行，等待用户选择
        const choice = await this.waitForUserChoice(tool.name, input, decision);

        switch (choice) {
          case "allow":
            return { allowed: true };

          case "always_allow": {
            // 写入 session 规则，后续同类操作自动放行
            const rule: PermissionRule = {
              source: "session",
              behavior: "allow",
              value: { toolName: tool.name },
            };
            addRule(this.ctx, rule);
            return { allowed: true };
          }

          case "deny":
            return { allowed: false, message: "用户拒绝" };
        }
      }
    }
  }

  /**
   * 挂起执行，等待用户通过 UI 做出选择。
   * 使用 Promise 将异步的 UI 交互转为同步的等待。
   */
  private waitForUserChoice(
    toolName: string,
    toolInput: Record<string, unknown>,
    decision: PermissionDecision,
  ): Promise<PermissionChoice> {
    return new Promise((resolve) => {
      this.onPermissionRequest!({
        toolName,
        toolInput,
        decision,
        resolve,
      });
    });
  }
}
