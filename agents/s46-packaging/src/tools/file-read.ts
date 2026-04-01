/**
 * FileReadTool（复用）
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const fileReadTool = buildTool({
  name: "file_read", description: "Read file contents with line numbers.",
  inputSchema: { type: "object" as const, properties: { path: { type: "string" }, offset: { type: "number" }, limit: { type: "number" } }, required: ["path"] },
  isReadOnly: true,
  async call(input, ctx): Promise<ToolResult> {
    const p = path.resolve(ctx.cwd, input.path as string);
    if (!p.startsWith(ctx.cwd)) return { output: "路径越权", isError: true };
    if (!fs.existsSync(p)) return { output: `文件不存在: ${input.path}`, isError: true };
    const lines = fs.readFileSync(p, "utf-8").split("\n");
    const off = ((input.offset as number) ?? 1) - 1;
    const lim = input.limit as number | undefined;
    const sl = lim ? lines.slice(off, off + lim) : lines.slice(off);
    const w = String(off + sl.length).length;
    return { output: `[${p}] ${lines.length} lines\n${sl.map((l, i) => `${String(off + i + 1).padStart(w)}|${l}`).join("\n")}` };
  },
});
