/**
 * s34 — 子 Agent 权限隔离
 *
 * 核心原则：Children can be stricter, never looser.
 * 子 Agent 的权限不能超过父 Agent。
 *
 * 三个关键约束：
 * 1. session allow 不继承 — 父 Agent 的批准不传递给子 Agent
 * 2. shouldAvoidPermissionPrompts — 无 UI 子 Agent 的 ask → deny
 * 3. 权限模式收紧 — 子 Agent 的模式不能比父更宽松
 *
 * 对照 Claude Code: tools/AgentTool/runAgent.ts (permission scoping)
 * - toolPermissionContext 替换 session allow 为显式 allowedTools
 * - shouldAvoidPermissionPrompts: async 子 Agent 默认不弹窗
 * - bubble 模式: 特殊的权限冒泡机制
 */

import {
  createPermissionContext,
  type PermissionContext,
  type PermissionMode,
  type PermissionRule,
} from "./permissions.js";

/**
 * 为子 Agent 创建权限上下文（权限收紧）。
 *
 * 对照 Claude Code: runAgent() 中的 toolPermissionContext 构造
 *
 * 关键：session 级 allow 规则不继承。
 * 父 Agent 会话中用户批准的操作，子 Agent 需要重新获得批准。
 */
export function createSubagentPermissionContext(
  parentCtx: PermissionContext,
  options: {
    allowedTools?: string[];
    permissionMode?: PermissionMode;
    shouldAvoidPrompts?: boolean;
  } = {},
): PermissionContext {
  // 子 Agent 的权限模式：不能比父更宽松
  const mode = resolveSubagentMode(parentCtx.mode, options.permissionMode);

  const childCtx = createPermissionContext(mode);

  // ── 关键：session allow 不继承 ───────────────
  // 只保留 cliArg 和 userSettings/projectSettings 级别的 allow 规则
  // 不传递 session 级别的 allow（父 Agent 的运行时批准不泄漏给子 Agent）
  const nonSessionAllows = parentCtx.allowRules.filter(
    (r) => r.source !== "session",
  );
  childCtx.allowRules = [...nonSessionAllows];

  // 如果指定了 allowedTools，用显式白名单替换
  if (options.allowedTools) {
    const explicitAllows: PermissionRule[] = options.allowedTools.map(
      (toolName) => ({
        source: "session" as const,
        behavior: "allow" as const,
        value: { toolName },
      }),
    );
    childCtx.allowRules = [...nonSessionAllows, ...explicitAllows];
  }

  // deny 和 ask 规则完整继承（只能更严）
  childCtx.denyRules = [...parentCtx.denyRules];
  childCtx.askRules = [...parentCtx.askRules];

  return childCtx;
}

/**
 * 解析子 Agent 的权限模式。
 *
 * 规则：子 Agent 的模式不能比父更宽松。
 * 宽松度排序：default < acceptEdits < bypassPermissions
 *
 * 对照 Claude Code: runAgent() 中的 permissionMode 处理
 * - 父级已是 bypass/acceptEdits → 不用子 agent 定义覆盖
 */
function resolveSubagentMode(
  parentMode: PermissionMode,
  requestedMode?: PermissionMode,
): PermissionMode {
  if (!requestedMode) return parentMode;

  const STRICTNESS: Record<PermissionMode, number> = {
    dontAsk: 0,       // 最严（ask → deny）
    default: 1,
    acceptEdits: 2,
    bypassPermissions: 3,  // 最宽松
  };

  const parentLevel = STRICTNESS[parentMode];
  const requestedLevel = STRICTNESS[requestedMode];

  // 子 Agent 不能比父更宽松
  if (requestedLevel > parentLevel) {
    return parentMode;
  }

  return requestedMode;
}

/**
 * 判断子 Agent 是否应该避免弹出权限提示。
 *
 * 对照 Claude Code:
 * - async 子 Agent 默认不弹窗（ask → deny）
 * - 有 canShowPermissionPrompts 显式控制
 * - bubble 模式允许权限冒泡到父 Agent
 */
export function shouldAvoidPermissionPrompts(options: {
  isAsync?: boolean;
  canShowPrompts?: boolean;
}): boolean {
  // 显式指定优先
  if (options.canShowPrompts !== undefined) {
    return !options.canShowPrompts;
  }

  // 异步子 Agent 默认不弹窗
  if (options.isAsync) {
    return true;
  }

  return false;
}
