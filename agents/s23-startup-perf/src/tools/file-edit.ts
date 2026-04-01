/**
 * FileEditTool（复用 s10）
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const fileEditTool = buildTool({
  name: "file_edit", description: "Replace a unique string in a file with a new string.",
  inputSchema: { type: "object" as const, properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, required: ["path", "old_string", "new_string"] },
  async call(input, ctx): Promise<ToolResult> {
    const p = path.resolve(ctx.cwd, input.path as string);
    if (!p.startsWith(ctx.cwd)) return { output: "路径越权", isError: true };
    if (!fs.existsSync(p)) return { output: `文件不存在: ${input.path}`, isError: true };
    const content = fs.readFileSync(p, "utf-8");
    const old = input.old_string as string;
    const count = content.split(old).length - 1;
    if (count === 0) return { output: "old_string 未找到", isError: true };
    if (count > 1) return { output: `old_string 出现 ${count} 次，必须唯一`, isError: true };
    fs.writeFileSync(p, content.replace(old, input.new_string as string), "utf-8");
    return { output: `已编辑 ${input.path}` };
  },
});
