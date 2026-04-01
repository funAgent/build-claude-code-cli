/**
 * s11 — GrepTool：内容搜索
 *
 * 在文件中搜索匹配正则表达式的行。
 * 返回文件名、行号、匹配内容。
 *
 * 对照 Claude Code: tools/GrepTool/GrepTool.ts
 * 生产版使用 ripgrep 进程调用，支持更复杂的选项
 * 教学版用 Node.js 逐文件扫描
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

function searchFile(filePath: string, regex: RegExp): GrepMatch[] {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const matches: GrepMatch[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (regex.test(lines[i])) {
        matches.push({ file: filePath, line: i + 1, content: lines[i] });
      }
    }
    return matches;
  } catch {
    return [];
  }
}

function walkDir(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(full, maxDepth, depth + 1));
      } else if (/\.(ts|tsx|js|json|md|txt|py|rs|go|yaml|yml|toml|sh)$/.test(entry.name)) {
        results.push(full);
      }
    }
  } catch { /* permission denied */ }
  return results;
}

export const grepTool = buildTool({
  name: "grep",
  description:
    "Search for a pattern in file contents using regex. Returns matching lines with file paths and line numbers.",
  inputSchema: {
    type: "object" as const,
    properties: {
      pattern: { type: "string", description: "Regex pattern to search for" },
      path: { type: "string", description: "Directory or file to search (default: cwd)" },
      include: { type: "string", description: "File extension filter (e.g. 'ts', 'json')" },
    },
    required: ["pattern"],
  },
  isReadOnly: true,
  async call(input, ctx): Promise<ToolResult> {
    const pattern = input.pattern as string;
    const searchPath = input.path
      ? path.resolve(ctx.cwd, input.path as string)
      : ctx.cwd;
    const include = input.include as string | undefined;

    let regex: RegExp;
    try {
      regex = new RegExp(pattern, "i");
    } catch (e) {
      return { output: `无效的正则表达式: ${e instanceof Error ? e.message : e}`, isError: true };
    }

    if (!fs.existsSync(searchPath)) {
      return { output: `路径不存在: ${searchPath}`, isError: true };
    }

    let files: string[];
    if (fs.statSync(searchPath).isFile()) {
      files = [searchPath];
    } else {
      files = walkDir(searchPath, 6);
      if (include) {
        files = files.filter((f) => f.endsWith(`.${include}`));
      }
    }

    const allMatches: GrepMatch[] = [];
    for (const file of files) {
      const matches = searchFile(file, regex);
      allMatches.push(...matches);
      if (allMatches.length > 500) break;
    }

    if (allMatches.length === 0) {
      return { output: `没有匹配 "${pattern}" 的内容` };
    }

    const truncated = allMatches.length > 500;
    const display = truncated ? allMatches.slice(0, 500) : allMatches;

    const lines = display.map((m) => {
      const rel = path.relative(ctx.cwd, m.file);
      return `${rel}:${m.line}: ${m.content.trim()}`;
    });

    const header = `找到 ${allMatches.length} 处匹配${truncated ? " (截断至 500)" : ""}`;
    return { output: `${header}\n${lines.join("\n")}` };
  },
});
