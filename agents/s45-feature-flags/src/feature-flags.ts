/**
 * s45 — Feature Flags
 *
 * Feature flag 不是开关——是让你在不回滚代码的情况下关闭出问题的功能。
 * 每个功能都是一个实验，直到被证明稳定。
 *
 * 关键流程：
 * 1. 编译期 DCE — feature('X') === false 时，整段代码被移除
 * 2. 运行时门控 — 环境变量 / 用户类型 / 远程配置
 * 3. 灰度发布 — 按用户百分比逐步开放
 *
 * 对照 Claude Code:
 * - bun-shim.ts: feature() 编译期展开
 * - entrypoints/cli.tsx: 运行时 polyfill
 * - services/analytics/growthbook.ts: 远程 flag
 */

// ── 类型定义 ─────────────────────────────────────────────────

export type FlagSource = "compile" | "env" | "config" | "remote";

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  source: FlagSource;
  description?: string;
}

/**
 * Flag 注册表。
 */
const flagRegistry = new Map<string, FeatureFlag>();

// ── 编译期 DCE ───────────────────────────────────────────────

/**
 * 编译期 feature flag（教学版运行时模拟）。
 *
 * 对照 Claude Code: import { feature } from 'bun:bundle'
 * 在真正的构建中，bundler 会将 feature('X') 替换为常量，
 * 使得 if (feature('X')) { ... } 中的代码在 feature 关闭时被 tree-shake 掉。
 */
export function feature(name: string): boolean {
  const flag = flagRegistry.get(name);
  if (flag) return flag.enabled;

  const envKey = `FEATURE_${name.toUpperCase()}`;
  return process.env[envKey] === "true";
}

// ── 运行时门控 ───────────────────────────────────────────────

/**
 * 注册 feature flag。
 */
export function registerFlag(
  name: string,
  enabled: boolean,
  source: FlagSource = "config",
  description?: string,
): void {
  flagRegistry.set(name, { name, enabled, source, description });
}

/**
 * 从环境变量批量加载 flags。
 *
 * 对照 Claude Code: cli.tsx 中的 polyfill 逻辑
 */
export function loadFlagsFromEnv(): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("FEATURE_")) {
      const name = key.slice(8).toLowerCase();
      registerFlag(name, value === "true", "env");
    }
  }
}

/**
 * 从配置文件加载 flags。
 */
export function loadFlagsFromConfig(
  config: Record<string, boolean>,
): void {
  for (const [name, enabled] of Object.entries(config)) {
    registerFlag(name, enabled, "config");
  }
}

// ── 灰度发布 ─────────────────────────────────────────────────

/**
 * 按用户百分比判断是否启用。
 *
 * 对照 Claude Code: GrowthBook / Statsig 灰度
 */
export function isEnabledForUser(
  flagName: string,
  userId: string,
  percentage: number,
): boolean {
  const hash = simpleHash(flagName + userId);
  return (hash % 100) < percentage;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// ── 用户类型分流 ─────────────────────────────────────────────

export type UserType = "internal" | "external" | "enterprise";

/**
 * 根据用户类型判断 flag。
 *
 * 对照 Claude Code: USER_TYPE === 'ant' 分流
 */
export function isEnabledForUserType(
  flagName: string,
  userType: UserType,
): boolean {
  const flag = flagRegistry.get(flagName);
  if (!flag) return false;

  if (userType === "internal") return true;
  return flag.enabled;
}

// ── 查询与管理 ───────────────────────────────────────────────

export function getAllFlags(): FeatureFlag[] {
  return Array.from(flagRegistry.values());
}

export function getFlag(name: string): FeatureFlag | undefined {
  return flagRegistry.get(name);
}

export function setFlag(name: string, enabled: boolean): void {
  const existing = flagRegistry.get(name);
  if (existing) {
    existing.enabled = enabled;
  } else {
    registerFlag(name, enabled, "config");
  }
}

/**
 * 常用 Feature Flags（示例）。
 *
 * 对照 Claude Code: 30+ feature flags
 */
export const COMMON_FLAGS = {
  REACTIVE_COMPACT: "reactive_compact",
  CONTEXT_COLLAPSE: "context_collapse",
  COORDINATOR_MODE: "coordinator_mode",
  SKILL_SEARCH: "skill_search",
  TOKEN_BUDGET: "token_budget",
  VOICE_MODE: "voice_mode",
  PERFETTO_TRACING: "perfetto_tracing",
} as const;
