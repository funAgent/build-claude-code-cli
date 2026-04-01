/**
 * FileReadTool（复用 s09）
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const fileReadTool = buildTool({
  name: "file_read",
  description: "Read file contents with line numbers. Use offset/limit for large files.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path" },
      offset: { type: "number", description: "Start line (1-based)" },
      limit: { type: "number", description: "Max lines to read" },
    },
    required: ["path"],
  },
  isReadOnly: true,
  async call(input, ctx): Promise<ToolResult> {
    const filePath = input.path as string;
    const resolved = path.resolve(ctx.cwd, filePath);
    if (!resolved.startsWith(ctx.cwd)) return { output: "路径越权", isError: true };
    if (!fs.existsSync(resolved)) return { output: `文件不存在: ${filePath}`, isError: true };
    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split("\n");
    const off = ((input.offset as number) ?? 1) - 1;
    const lim = input.limit as number | undefined;
    const sliced = lim ? lines.slice(off, off + lim) : lines.slice(off);
    const w = String(off + sliced.length).length;
    const numbered = sliced.map((l, i) => `${String(off + i + 1).padStart(w)}|${l}`).join("\n");
    return { output: `[${resolved}] ${lines.length} lines\n${numbered}` };
  },
});
