/**
 * s12 — LsTool: 列出目录内容
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const lsTool = buildTool({
  name: "ls",
  description: "List files and directories in a given path.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "Directory path (default: cwd)" },
    },
    required: [],
  },
  isReadOnly: true,
  async call(input, ctx): Promise<ToolResult> {
    const dir = input.path ? path.resolve(ctx.cwd, input.path as string) : ctx.cwd;
    if (!fs.existsSync(dir)) return { output: `目录不存在: ${dir}`, isError: true };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const lines = entries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => `${e.isDirectory() ? "📁" : "📄"} ${e.name}`)
      .join("\n");
    return { output: lines || "(empty directory)" };
  },
});
