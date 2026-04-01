/**
 * s47 — Native 能力
 *
 * 与操作系统集成不一定需要写 C++——4 种策略各有适用场景。
 *
 * 策略对比：
 * 1. Pure TS/JS — 零依赖，跨平台，但能力有限
 * 2. WASM — 近原生性能，跨平台，但启动慢
 * 3. Spawn 系统命令 — 利用系统工具，简单但依赖外部
 * 4. Native Addon / FFI — 最强能力，但平台绑定
 *
 * 对照 Claude Code:
 * - packages/color-diff-napi: Pure TS 替代
 * - packages/modifiers-napi: FFI 调 Carbon.framework
 * - packages/image-processor-napi: sharp (native addon)
 * - utils/ripgrep.ts: 三档降级 (system → vendor → embedded)
 */

import { execSync, spawnSync } from "child_process";
import { existsSync } from "fs";

// ── 类型定义 ─────────────────────────────────────────────────

export type NativeStrategy = "pure-ts" | "wasm" | "spawn" | "native-addon" | "ffi";

export interface NativeCapability {
  name: string;
  strategy: NativeStrategy;
  available: boolean;
  fallback?: NativeStrategy;
}

// ── 策略 1: Pure TS ──────────────────────────────────────────

/**
 * 纯 TS 实现的文本差异比较。
 *
 * 对照 Claude Code: packages/color-diff-napi
 * 从原始的 Rust/native 实现改为纯 TS 重写——零依赖，跨平台。
 */
export function diffText(oldText: string, newText: string): string[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: string[] = [];

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i >= oldLines.length) {
      result.push(`+ ${newLines[j++]}`);
    } else if (j >= newLines.length) {
      result.push(`- ${oldLines[i++]}`);
    } else if (oldLines[i] === newLines[j]) {
      result.push(`  ${oldLines[i]}`);
      i++;
      j++;
    } else {
      result.push(`- ${oldLines[i++]}`);
      result.push(`+ ${newLines[j++]}`);
    }
  }

  return result;
}

// ── 策略 2: Spawn 系统命令 ───────────────────────────────────

/**
 * 通过系统命令搜索文件（三档降级）。
 *
 * 对照 Claude Code: utils/ripgrep.ts
 * 1. system: PATH 上的 rg
 * 2. vendor: 预编译的 vendor/ripgrep 二进制
 * 3. fallback: 内置的 grep 模拟
 */
export type RipgrepMode = "system" | "vendor" | "fallback";

export function detectRipgrepMode(): RipgrepMode {
  try {
    execSync("rg --version", { stdio: "pipe" });
    return "system";
  } catch {
    // 无系统 rg
  }

  if (existsSync("./vendor/ripgrep")) {
    return "vendor";
  }

  return "fallback";
}

export function searchWithRipgrep(
  pattern: string,
  path: string,
): { output: string; mode: RipgrepMode } {
  const mode = detectRipgrepMode();

  try {
    let cmd: string;
    switch (mode) {
      case "system":
        cmd = `rg "${pattern}" "${path}" --no-heading`;
        break;
      case "vendor":
        cmd = `./vendor/ripgrep "${pattern}" "${path}" --no-heading`;
        break;
      case "fallback":
        cmd = `grep -rn "${pattern}" "${path}"`;
        break;
    }

    const output = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return { output, mode };
  } catch {
    return { output: "", mode };
  }
}

// ── 策略 3: 剪贴板集成 ──────────────────────────────────────

/**
 * 跨平台剪贴板操作。
 *
 * 对照 Claude Code: 剪贴板图片通过 osascript (macOS) / xclip (Linux)
 */
export function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      spawnSync("pbcopy", { input: text });
    } else if (platform === "linux") {
      spawnSync("xclip", ["-selection", "clipboard"], { input: text });
    } else if (platform === "win32") {
      spawnSync("clip", { input: text });
    }
    return true;
  } catch {
    return false;
  }
}

export function readFromClipboard(): string | null {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      return execSync("pbpaste", { encoding: "utf-8" });
    } else if (platform === "linux") {
      return execSync("xclip -selection clipboard -o", { encoding: "utf-8" });
    }
    return null;
  } catch {
    return null;
  }
}

// ── 能力检测 ─────────────────────────────────────────────────

/**
 * 检测系统原生能力。
 *
 * 对照 Claude Code: Doctor 的 ripgrepStatus + 安装类型检测
 */
export function detectCapabilities(): NativeCapability[] {
  return [
    {
      name: "ripgrep",
      strategy: detectRipgrepMode() === "system" ? "spawn" : "pure-ts",
      available: true,
      fallback: "pure-ts",
    },
    {
      name: "clipboard",
      strategy: "spawn",
      available: canAccessClipboard(),
      fallback: undefined,
    },
    {
      name: "text-diff",
      strategy: "pure-ts",
      available: true,
    },
  ];
}

function canAccessClipboard(): boolean {
  try {
    if (process.platform === "darwin") {
      execSync("which pbcopy", { stdio: "pipe" });
      return true;
    }
    if (process.platform === "linux") {
      execSync("which xclip", { stdio: "pipe" });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
