/**
 * FileWriteTool（复用）
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const fileWriteTool = buildTool({
  name: "file_write", description: "Write content to a file.",
  inputSchema: { type: "object" as const, properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
  async call(input, ctx): Promise<ToolResult> {
    const p = path.resolve(ctx.cwd, input.path as string);
    if (!p.startsWith(ctx.cwd)) return { output: "路径越权", isError: true };
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const existed = fs.existsSync(p);
    fs.writeFileSync(p, input.content as string, "utf-8");
    return { output: `${existed ? "已覆盖" : "已创建"} ${input.path}` };
  },
});
