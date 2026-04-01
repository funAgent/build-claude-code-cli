/**
 * s09 — FileReadTool
 *
 * 读取文件内容，自动添加行号标注。
 * 支持 offset/limit 读取大文件的部分内容。
 *
 * 对照 Claude Code: tools/FileReadTool/FileReadTool.tsx
 * 生产版增加了：
 * - 图片文件 base64 编码
 * - PDF 转文本
 * - 二进制文件检测
 * - 文件大小限制
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult, type ToolContext } from "../tool.js";

function validatePath(filePath: string, cwd: string): string | null {
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) {
    return "路径越权：不允许访问工作目录之外的文件";
  }
  return null;
}

function addLineNumbers(content: string, offset = 0): string {
  const lines = content.split("\n");
  const width = String(offset + lines.length).length;
  return lines
    .map((line, i) => `${String(offset + i + 1).padStart(width)}|${line}`)
    .join("\n");
}

export const fileReadTool = buildTool({
  name: "file_read",
  description:
    "Read the contents of a file. Output includes line numbers. Use offset and limit for large files.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path (relative to cwd or absolute)" },
      offset: { type: "number", description: "Start reading from this line (1-based, default: 1)" },
      limit: { type: "number", description: "Maximum number of lines to read" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  async call(input, context): Promise<ToolResult> {
    const filePath = input.path as string;
    const offset = ((input.offset as number) ?? 1) - 1;
    const limit = input.limit as number | undefined;

    const err = validatePath(filePath, context.cwd);
    if (err) return { output: err, isError: true };

    const resolved = path.resolve(context.cwd, filePath);

    if (!fs.existsSync(resolved)) {
      return { output: `文件不存在: ${filePath}`, isError: true };
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return { output: `${filePath} 是一个目录，不是文件`, isError: true };
    }

    const content = fs.readFileSync(resolved, "utf-8");
    const allLines = content.split("\n");
    const sliced = limit ? allLines.slice(offset, offset + limit) : allLines.slice(offset);

    const numbered = addLineNumbers(sliced.join("\n"), offset);
    const meta = `[${resolved}] ${allLines.length} lines total`;

    return { output: `${meta}\n${numbered}` };
  },
});
