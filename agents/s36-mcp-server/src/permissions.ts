/**
 * s32 — 权限规则引擎
 *
 * AI Agent 能执行 shell 命令、读写文件——不加权限控制，
 * 等于给 AI 无限制的 root 权限。权限引擎用规则而非 prompt 约束来保障安全。
 *
 * 核心设计：
 * 1. PermissionRule: toolName + ruleContent + behavior(allow/deny/ask)
 * 2. PermissionMode: 全局安全级别（default/acceptEdits/bypass/dontAsk）
 * 3. 匹配算法: deny 优先 → ask 规则 → tool.checkPermissions → bypass → allow → ask
 * 4. 规则来源: userSettings / projectSettings / session / cliArg
 *
 * 对照 Claude Code: utils/permissions/permissions.ts (~950 行)
 * - hasPermissionsToUseToolInner: 完整的决策流水线
 * - toolMatchesRule: 工具名 + 内容的规则匹配
 * - PermissionMode: 6+ 种模式（含 auto 分类器）
 */

// ── 类型定义 ─────────────────────────────────────────────────

/**
 * 权限行为：允许 / 拒绝 / 询问用户
 * 对照 Claude Code: PermissionBehavior = 'allow' | 'deny' | 'ask'
 */
export type PermissionBehavior = "allow" | "deny" | "ask";

/**
 * 权限规则来源。
 * 优先级从高到低：cliArg > session > projectSettings > userSettings
 * 对照 Claude Code: PermissionRuleSource
 */
export type PermissionRuleSource =
  | "userSettings"    // 全局设置
  | "projectSettings" // 项目级设置
  | "session"         // 当前会话（用户运行时批准）
  | "cliArg";         // CLI 参数

/**
 * 权限规则值：工具名 + 可选的内容匹配。
 * 例如: { toolName: "bash", ruleContent: "npm test" }
 *   → 只对 bash 执行 npm test 生效
 */
export interface PermissionRuleValue {
  toolName: string;
  ruleContent?: string;
}

/**
 * 完整的权限规则。
 * 对照 Claude Code: PermissionRule
 */
export interface PermissionRule {
  source: PermissionRuleSource;
  behavior: PermissionBehavior;
  value: PermissionRuleValue;
}

/**
 * 权限模式 — 全局安全级别。
 * 对照 Claude Code: PermissionMode
 * - default: 标准模式，按规则 + 用户审批
 * - acceptEdits: 自动批准文件编辑，仍询问 bash
 * - bypassPermissions: 跳过大部分权限检查（仍受 safety check 约束）
 * - dontAsk: 不询问用户，ask 自动变 deny
 */
export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "dontAsk";

/**
 * 权限检查结果。
 */
export interface PermissionDecision {
  behavior: PermissionBehavior;
  message?: string;
  rule?: PermissionRule;
}

// ── 权限上下文 ───────────────────────────────────────────────

/**
 * 工具权限上下文。
 * 对照 Claude Code: ToolPermissionContext
 * 生产版按 source 分桶存储规则；教学版用数组简化。
 */
export interface PermissionContext {
  mode: PermissionMode;
  allowRules: PermissionRule[];
  denyRules: PermissionRule[];
  askRules: PermissionRule[];
}

/**
 * 创建默认权限上下文。
 */
export function createPermissionContext(
  mode: PermissionMode = "default",
): PermissionContext {
  return {
    mode,
    allowRules: [],
    denyRules: [],
    askRules: [],
  };
}

/**
 * 添加规则到上下文。
 */
export function addRule(
  ctx: PermissionContext,
  rule: PermissionRule,
): void {
  switch (rule.behavior) {
    case "allow":
      ctx.allowRules.push(rule);
      break;
    case "deny":
      ctx.denyRules.push(rule);
      break;
    case "ask":
      ctx.askRules.push(rule);
      break;
  }
}

// ── 规则匹配 ─────────────────────────────────────────────────

/**
 * 检查工具是否匹配规则（整工具级别）。
 *
 * 对照 Claude Code: toolMatchesRule()
 * - 整工具规则: ruleContent === undefined → 工具名匹配即命中
 * - 内容规则: ruleContent !== undefined → 工具名 + 内容都要匹配
 * - MCP 工具: mcp__server 匹配该 server 下所有工具
 */
export function toolMatchesRule(
  toolName: string,
  rule: PermissionRule,
  toolInput?: string,
): boolean {
  const ruleToolName = rule.value.toolName;
  const ruleContent = rule.value.ruleContent;

  // 工具名不匹配
  if (ruleToolName !== toolName) return false;

  // 整工具规则（无 ruleContent）
  if (ruleContent === undefined) return true;

  // 内容级规则：需要输入匹配
  if (toolInput === undefined) return false;
  return toolInput.includes(ruleContent);
}

/**
 * 在规则列表中查找第一个匹配的规则。
 */
function findMatchingRule(
  toolName: string,
  rules: PermissionRule[],
  toolInput?: string,
): PermissionRule | undefined {
  // 整工具规则优先
  for (const rule of rules) {
    if (rule.value.ruleContent === undefined && toolMatchesRule(toolName, rule)) {
      return rule;
    }
  }
  // 内容级规则
  for (const rule of rules) {
    if (rule.value.ruleContent !== undefined && toolMatchesRule(toolName, rule, toolInput)) {
      return rule;
    }
  }
  return undefined;
}

// ── 权限检查主入口 ───────────────────────────────────────────

/**
 * 工具级权限检查回调。
 * 每个工具可以实现自己的细粒度权限逻辑。
 * 对照 Claude Code: tool.checkPermissions(parsedInput, context)
 */
export type ToolPermissionCheck = (
  input: Record<string, unknown>,
) => PermissionDecision;

/**
 * 检查是否有权限使用工具。
 *
 * 对照 Claude Code: hasPermissionsToUseToolInner()
 * 决策流水线（严格按顺序）:
 *
 *   1. 整工具 deny 规则  → deny
 *   2. 整工具 ask 规则   → ask
 *   3. tool.checkPermissions() → 工具自定义检查
 *   4. 内容级 ask 规则   → ask（即使 bypass 也拦截）
 *   5. bypass 模式       → allow
 *   6. 整工具 allow 规则 → allow
 *   7. 默认              → ask
 */
export function hasPermissionsToUseTool(
  toolName: string,
  input: Record<string, unknown>,
  ctx: PermissionContext,
  toolPermissionCheck?: ToolPermissionCheck,
): PermissionDecision {
  // 提取用于内容匹配的字符串
  const toolInput = extractToolInput(toolName, input);

  // ── Step 1: 整工具 deny ──────────────────────
  const denyRule = findMatchingRule(toolName, ctx.denyRules);
  if (denyRule && denyRule.value.ruleContent === undefined) {
    return {
      behavior: "deny",
      message: `工具 ${toolName} 被规则禁止`,
      rule: denyRule,
    };
  }

  // ── Step 2: 整工具 ask ───────────────────────
  const askRule = findMatchingRule(toolName, ctx.askRules);
  if (askRule && askRule.value.ruleContent === undefined) {
    return {
      behavior: "ask",
      message: `工具 ${toolName} 需要用户确认`,
      rule: askRule,
    };
  }

  // ── Step 3: 工具自定义权限检查 ───────────────
  if (toolPermissionCheck) {
    const toolDecision = toolPermissionCheck(input);
    if (toolDecision.behavior === "deny") return toolDecision;
    if (toolDecision.behavior === "ask") {
      // 即使 bypass 也尊重工具自定义的 ask（safety check）
      return toolDecision;
    }
  }

  // ── Step 4: 内容级 deny/ask ──────────────────
  const contentDeny = findContentRule(toolName, ctx.denyRules, toolInput);
  if (contentDeny) {
    return {
      behavior: "deny",
      message: `操作被内容规则禁止: ${contentDeny.value.ruleContent}`,
      rule: contentDeny,
    };
  }

  const contentAsk = findContentRule(toolName, ctx.askRules, toolInput);
  if (contentAsk) {
    // 内容级 ask 即使在 bypass 模式也拦截
    return {
      behavior: "ask",
      message: `操作需要确认: ${contentAsk.value.ruleContent}`,
      rule: contentAsk,
    };
  }

  // ── Step 5: bypass 模式 ──────────────────────
  if (ctx.mode === "bypassPermissions") {
    return { behavior: "allow", message: "bypass 模式放行" };
  }

  // ── Step 6: acceptEdits（自动批准文件编辑类工具）
  if (ctx.mode === "acceptEdits") {
    const editTools = new Set(["file_write", "file_edit"]);
    if (editTools.has(toolName)) {
      return { behavior: "allow", message: "acceptEdits 模式自动批准编辑" };
    }
  }

  // ── Step 7: 整工具 allow 规则 ────────────────
  const allowRule = findMatchingRule(toolName, ctx.allowRules, toolInput);
  if (allowRule) {
    return { behavior: "allow", rule: allowRule };
  }

  // ── Step 8: 只读工具默认放行 ─────────────────
  // 对照 Claude Code: 只读工具（glob, grep, ls, file_read）不需要权限
  const readOnlyTools = new Set([
    "glob", "grep", "ls", "file_read", "todo_write",
    "task_list", "task_get", "tool_search", "skill", "help",
  ]);
  if (readOnlyTools.has(toolName)) {
    return { behavior: "allow", message: "只读工具默认放行" };
  }

  // ── Step 9: 默认 → ask ──────────────────────
  return {
    behavior: "ask",
    message: `工具 ${toolName} 需要用户确认`,
  };
}

/**
 * 应用 dontAsk 模式：ask → deny。
 * 对照 Claude Code: 外层 hasPermissionsToUseTool 对 dontAsk 的处理
 */
export function applyModePolicy(
  decision: PermissionDecision,
  mode: PermissionMode,
): PermissionDecision {
  if (mode === "dontAsk" && decision.behavior === "ask") {
    return {
      behavior: "deny",
      message: "dontAsk 模式: 需要确认的操作被自动拒绝",
    };
  }
  return decision;
}

// ── 辅助函数 ─────────────────────────────────────────────────

function findContentRule(
  toolName: string,
  rules: PermissionRule[],
  toolInput?: string,
): PermissionRule | undefined {
  if (!toolInput) return undefined;
  return rules.find(
    (r) =>
      r.value.ruleContent !== undefined &&
      toolMatchesRule(toolName, r, toolInput),
  );
}

/**
 * 从工具输入中提取用于权限匹配的字符串。
 */
function extractToolInput(
  toolName: string,
  input: Record<string, unknown>,
): string | undefined {
  switch (toolName) {
    case "bash":
      return input.command as string | undefined;
    case "file_write":
    case "file_read":
    case "file_edit":
      return input.path as string | undefined;
    default:
      return undefined;
  }
}
