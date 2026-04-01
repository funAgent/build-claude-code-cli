/**
 * s23 — 并行预取
 *
 * 把启动时需要做的独立 I/O 操作并行执行，而不是顺序等待。
 * 每个 prefetch 返回 Promise，在需要结果时 await。
 *
 * 典型场景：
 * - 读取配置文件
 * - 检测项目根目录
 * - 加载 RULES.md
 * - 验证 API key
 *
 * 对照 Claude Code: main.tsx 中的 startKeychainPrefetch、
 * prefetchOfficialMcpUrls、prefetchAllMcpResources 等
 * 生产版有 ~15 个并行 prefetch，部分延迟到首次渲染后
 * 教学版展示核心"并行启动"模式
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { profileCheckpoint } from "./perf.js";

export interface PrefetchResults {
  projectRoot: string | null;
  rulesContent: string | null;
  apiKeyValid: boolean;
  gitDetected: boolean;
}

// 模块级变量缓存 Promise——幂等设计：多次调用不会重复执行 I/O
let prefetchPromise: Promise<PrefetchResults> | null = null;

export function startPrefetch(cwd: string): Promise<PrefetchResults> {
  if (prefetchPromise) return prefetchPromise; // 已启动则复用

  profileCheckpoint("prefetch_start");

  // Promise.all 并行执行 4 个独立 I/O，总耗时 = max(各操作)
  // 串行执行 200+100+50+100=450ms，并行只需 ~200ms
  prefetchPromise = Promise.all([
    detectProjectRoot(cwd),
    loadRulesFile(cwd),
    validateApiKey(),
    detectGit(cwd),
  ]).then(([projectRoot, rulesContent, apiKeyValid, gitDetected]) => {
    profileCheckpoint("prefetch_done");
    return { projectRoot, rulesContent, apiKeyValid, gitDetected };
  });

  return prefetchPromise;
}

export function getPrefetchResults(): Promise<PrefetchResults> | null {
  return prefetchPromise;
}

async function detectProjectRoot(cwd: string): Promise<string | null> {
  let dir = cwd;
  while (true) {
    if (
      existsSync(resolve(dir, "package.json")) ||
      existsSync(resolve(dir, ".git"))
    ) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

async function loadRulesFile(cwd: string): Promise<string | null> {
  const candidates = [
    resolve(cwd, "RULES.md"),
    resolve(cwd, ".rules"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      return readFileSync(p, "utf-8");
    }
  }
  return null;
}

async function validateApiKey(): Promise<boolean> {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key.startsWith("sk-ant-"));
}

async function detectGit(cwd: string): Promise<boolean> {
  let dir = cwd;
  while (true) {
    if (existsSync(resolve(dir, ".git"))) return true;
    const parent = resolve(dir, "..");
    if (parent === dir) return false;
    dir = parent;
  }
}
