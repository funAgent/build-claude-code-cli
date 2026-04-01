/**
 * s43 — Worktree 隔离
 *
 * Git Worktree 给每个 Agent 一个平行世界——文件不冲突，提交不混乱。
 * 多个 Agent 可以同时修改不同分支，互不干扰。
 *
 * 关键流程：
 * 1. createAgentWorktree → git worktree add 创建隔离工作区
 * 2. 每个 Agent 在自己的 worktree 目录下工作
 * 3. 完成后如果没有更改，自动清理
 * 4. 有更改则保留供用户审查
 *
 * 对照 Claude Code:
 * - utils/worktree.ts (~500 行)
 * - WorktreeSession 类型
 * - createAgentWorktree / removeAgentWorktree
 * - cleanupStaleAgentWorktrees
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join, basename } from "path";

// ── 类型定义 ─────────────────────────────────────────────────

/**
 * Worktree 会话。
 * 对照 Claude Code: WorktreeSession
 */
export interface WorktreeSession {
  originalCwd: string;
  worktreePath: string;
  worktreeName: string;
  branch: string;
  agentSlug: string;
}

// ── Worktree 路径 ────────────────────────────────────────────

/**
 * 获取 worktree 存放目录。
 * 对照 Claude Code: worktreePathFor → <repo>/.claude/worktrees/{slug}
 */
function getWorktreeBasePath(gitRoot: string): string {
  return join(gitRoot, ".claude", "worktrees");
}

/**
 * 生成 worktree 分支名。
 * 对照 Claude Code: worktreeBranchName → worktree-{slug}
 */
function worktreeBranchName(slug: string): string {
  return `worktree-${slug.replace(/\//g, "+")}`;
}

// ── Git 操作 ─────────────────────────────────────────────────

/**
 * 找到 Git 仓库根目录。
 * 对照 Claude Code: findCanonicalGitRoot
 */
export function findGitRoot(cwd: string): string | null {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * 检查 worktree 是否有未提交的更改。
 * 对照 Claude Code: hasWorktreeChanges
 */
export function hasWorktreeChanges(worktreePath: string): boolean {
  try {
    const status = execSync("git status --porcelain", {
      cwd: worktreePath,
      encoding: "utf-8",
    }).trim();
    return status.length > 0;
  } catch {
    return false;
  }
}

// ── 创建 Worktree ────────────────────────────────────────────

/**
 * 为 Agent 创建独立的 git worktree。
 *
 * 对照 Claude Code: createAgentWorktree
 * - 在主仓库的 .claude/worktrees/ 下创建
 * - 每个 Agent 获得独立分支和工作目录
 * - 不改变全局 currentWorktreeSession
 */
export function createAgentWorktree(
  slug: string,
  cwd: string,
): WorktreeSession | null {
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return null;

  const worktreeBase = getWorktreeBasePath(gitRoot);
  mkdirSync(worktreeBase, { recursive: true });

  const worktreePath = join(worktreeBase, slug);
  const branch = worktreeBranchName(slug);

  if (existsSync(worktreePath)) {
    return {
      originalCwd: cwd,
      worktreePath,
      worktreeName: slug,
      branch,
      agentSlug: slug,
    };
  }

  try {
    execSync(`git worktree add -b "${branch}" "${worktreePath}" HEAD`, {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });

    return {
      originalCwd: cwd,
      worktreePath,
      worktreeName: slug,
      branch,
      agentSlug: slug,
    };
  } catch (error) {
    console.error(`创建 worktree 失败: ${(error as Error).message}`);
    return null;
  }
}

// ── 删除 Worktree ────────────────────────────────────────────

/**
 * 删除 Agent 的 worktree。
 *
 * 对照 Claude Code: removeAgentWorktree
 * - git worktree remove --force
 * - 删除 worktree-* 分支
 */
export function removeAgentWorktree(
  slug: string,
  cwd: string,
): boolean {
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return false;

  const worktreePath = join(getWorktreeBasePath(gitRoot), slug);
  const branch = worktreeBranchName(slug);

  try {
    execSync(`git worktree remove --force "${worktreePath}"`, {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch {
    // worktree 可能已经不存在
  }

  try {
    execSync(`git branch -D "${branch}"`, {
      cwd: gitRoot,
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch {
    // 分支可能已经不存在
  }

  return true;
}

// ── 清理 ─────────────────────────────────────────────────────

/**
 * 清理过期的 Agent worktree。
 *
 * 对照 Claude Code: cleanupStaleAgentWorktrees
 * - 只清理 agent-/wf_/bridge-/job- 等临时 slug
 * - 避免删掉用户命名的 worktree
 */
const EPHEMERAL_PREFIXES = ["agent-", "wf_", "bridge-", "job-"];

export function cleanupStaleWorktrees(cwd: string): number {
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) return 0;

  const worktreeBase = getWorktreeBasePath(gitRoot);
  if (!existsSync(worktreeBase)) return 0;

  const { readdirSync } = require("fs");
  const entries = readdirSync(worktreeBase, { withFileTypes: true });
  let cleaned = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const isEphemeral = EPHEMERAL_PREFIXES.some((p) => entry.name.startsWith(p));
    if (!isEphemeral) continue;

    if (!hasWorktreeChanges(join(worktreeBase, entry.name))) {
      removeAgentWorktree(entry.name, cwd);
      cleaned++;
    }
  }

  return cleaned;
}

// ── Agent 工具集成 ───────────────────────────────────────────

/**
 * 在 worktree 中执行 Agent 工作的完整流程。
 *
 * 对照 Claude Code: AgentTool.tsx 中的 worktree 逻辑
 * - 创建 worktree
 * - 在隔离目录下执行
 * - 完成后判断是否有更改
 * - 无更改则清理，有更改则保留
 */
export function withAgentWorktree<T>(
  agentId: string,
  cwd: string,
  fn: (worktreePath: string) => T,
): { result: T; worktreePath?: string; hasChanges: boolean } {
  const slug = `agent-${agentId.slice(0, 8)}`;
  const session = createAgentWorktree(slug, cwd);

  if (!session) {
    const result = fn(cwd);
    return { result, hasChanges: false };
  }

  const result = fn(session.worktreePath);
  const changes = hasWorktreeChanges(session.worktreePath);

  if (!changes) {
    removeAgentWorktree(slug, cwd);
  }

  return {
    result,
    worktreePath: changes ? session.worktreePath : undefined,
    hasChanges: changes,
  };
}
