/**
 * s11 — GlobTool：文件模式搜索
 *
 * 按 glob 模式匹配文件路径，返回匹配列表。
 * 搜索是 Agent 最高频的工具——先找到再修改。
 *
 * 对照 Claude Code: tools/GlobTool/GlobTool.ts
 * 生产版使用 ripgrep --files --glob，更快
 * 教学版用 Node.js fs 递归扫描
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

function matchGlob(pattern: string, filePath: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{DOUBLE}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{DOUBLE\}\}/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(filePath);
}

function walkDir(dir: string, base: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(base, full);
      if (entry.isDirectory()) {
        results.push(...walkDir(full, base, maxDepth, depth + 1));
      } else {
        results.push(rel);
      }
    }
  } catch { /* permission denied */ }
  return results;
}

export const globTool = buildTool({
  name: "glob",
  description:
    "Find files matching a glob pattern. Returns a list of matching file paths. Use ** for recursive matching.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pattern: { type: "string", description: "Glob pattern (e.g. '**/*.ts', 'src/**/*.json')" },
      path: { type: "string", description: "Directory to search in (default: cwd)" },
    },
    required: ["pattern"],
  },
  isReadOnly: true,
  async call(input, ctx): Promise<ToolResult> {
    const pattern = input.pattern as string;
    const searchDir = input.path
      ? path.resolve(ctx.cwd, input.path as string)
      : ctx.cwd;

    if (!fs.existsSync(searchDir)) {
      return { output: `目录不存在: ${searchDir}`, isError: true };
    }

    const allFiles = walkDir(searchDir, searchDir, 8);
    const matched = allFiles.filter((f) => matchGlob(pattern, f));

    if (matched.length === 0) {
      return { output: `没有匹配 "${pattern}" 的文件` };
    }

    const MAX_RESULTS = 200;
    const truncated = matched.length > MAX_RESULTS;
    const display = truncated ? matched.slice(0, MAX_RESULTS) : matched;

    const header = `找到 ${matched.length} 个文件${truncated ? ` (显示前 ${MAX_RESULTS} 个)` : ""}`;
    return { output: `${header}\n${display.join("\n")}` };
  },
});
