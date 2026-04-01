/**
 * s09 — FileWriteTool
 *
 * 写入文件内容。如果目录不存在会自动创建。
 *
 * 对照 Claude Code: tools/FileWriteTool/FileWriteTool.tsx
 * 生产版增加了：
 * - 写前快照（用于 undo）
 * - diff 预览
 * - 权限检查
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

export const fileWriteTool = buildTool({
  name: "file_write",
  description:
    "Write content to a file. Creates the file and parent directories if they don't exist. Overwrites existing content.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path to write to" },
      content: { type: "string", description: "Content to write to the file" },
    },
    required: ["path", "content"],
  },
  async call(input, context): Promise<ToolResult> {
    const filePath = input.path as string;
    const content = input.content as string;

    const err = validatePath(filePath, context.cwd);
    if (err) return { output: err, isError: true };

    const resolved = path.resolve(context.cwd, filePath);
    const dir = path.dirname(resolved);

    fs.mkdirSync(dir, { recursive: true });

    const existed = fs.existsSync(resolved);
    fs.writeFileSync(resolved, content, "utf-8");

    const lines = content.split("\n").length;
    const action = existed ? "已覆盖" : "已创建";

    return { output: `${action} ${filePath} (${lines} 行)` };
  },
});
