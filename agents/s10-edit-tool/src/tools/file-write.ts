/**
 * FileWriteTool（复用 s09）
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const fileWriteTool = buildTool({
  name: "file_write",
  description: "Write content to a file. Creates parent directories if needed.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path" },
      content: { type: "string", description: "Content to write" },
    },
    required: ["path", "content"],
  },
  async call(input, ctx): Promise<ToolResult> {
    const filePath = input.path as string;
    const content = input.content as string;
    const resolved = path.resolve(ctx.cwd, filePath);
    if (!resolved.startsWith(ctx.cwd)) return { output: "路径越权", isError: true };
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const existed = fs.existsSync(resolved);
    fs.writeFileSync(resolved, content, "utf-8");
    return { output: `${existed ? "已覆盖" : "已创建"} ${filePath} (${content.split("\n").length} 行)` };
  },
});
