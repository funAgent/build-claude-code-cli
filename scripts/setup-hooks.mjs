#!/usr/bin/env node

/**
 * 安装 Git pre-commit hook
 * 运行方式：node scripts/setup-hooks.mjs
 */

import { writeFileSync, chmodSync, existsSync, mkdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const HOOKS_DIR = join(ROOT, ".git", "hooks");

if (!existsSync(HOOKS_DIR)) {
  mkdirSync(HOOKS_DIR, { recursive: true });
}

const hookContent = `#!/bin/sh
# Build Claude Code — pre-commit consistency check

echo "Running lesson consistency check..."
node scripts/check-consistency.mjs

if [ $? -ne 0 ]; then
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║  课程一致性校验失败                           ║"
  echo "║                                              ║"
  echo "║  请修复上述错误后再提交。                      ║"
  echo "║  详细信息：node scripts/check-consistency.mjs --verbose  ║"
  echo "║  跳过检查：git commit --no-verify             ║"
  echo "╚══════════════════════════════════════════════╝"
  exit 1
fi
`;

const hookPath = join(HOOKS_DIR, "pre-commit");
writeFileSync(hookPath, hookContent, "utf-8");
chmodSync(hookPath, 0o755);

console.log("✓ Pre-commit hook 已安装到 .git/hooks/pre-commit");
console.log("  每次 git commit 时会自动运行课程一致性校验");
console.log("  跳过检查：git commit --no-verify");
