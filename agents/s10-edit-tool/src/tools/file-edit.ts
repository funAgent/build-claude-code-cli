/**
 * s10 — FileEditTool：精确替换
 *
 * 用 old_string → new_string 的方式修改文件，
 * 而不是整文件覆写。节省 90% 的 token。
 *
 * 核心约束：old_string 必须在文件中唯一出现。
 * 如果出现 0 次或 >1 次，工具返回错误让模型自修正。
 *
 * 对照 Claude Code: tools/FileEditTool/FileEditTool.ts
 * 生产版增加了：
 * - diff 预览（修改前后对比）
 * - 权限检查
 * - 编辑历史追踪
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { buildTool, type ToolResult } from "../tool.js";

export const fileEditTool = buildTool({
  name: "file_edit",
  description:
    "Replace a specific string in a file with a new string. The old_string must appear exactly once in the file. This is more efficient than rewriting the entire file.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: { type: "string", description: "File path to edit" },
      old_string: { type: "string", description: "The exact string to find (must be unique in the file)" },
      new_string: { type: "string", description: "The replacement string" },
    },
    required: ["path", "old_string", "new_string"],
  },
  async call(input, ctx): Promise<ToolResult> {
    const filePath = input.path as string;
    const oldStr = input.old_string as string;
    const newStr = input.new_string as string;

    const resolved = path.resolve(ctx.cwd, filePath);
    if (!resolved.startsWith(ctx.cwd)) {
      return { output: "路径越权", isError: true };
    }

    if (!fs.existsSync(resolved)) {
      return { output: `文件不存在: ${filePath}`, isError: true };
    }

    const content = fs.readFileSync(resolved, "utf-8");

    // 唯一性校验：old_string 必须在文件中恰好出现 1 次
    // 这是 Claude Code FileEditTool 的核心安全机制——
    // 防止模型的模糊匹配导致错误的位置被替换
    const count = content.split(oldStr).length - 1;

    if (count === 0) {
      // 找不到 → 返回文件预览，帮助模型修正 old_string
      const lines = content.split("\n");
      const preview = lines.slice(0, 20).map((l, i) => `${i + 1}|${l}`).join("\n");
      return {
        output: `old_string 未在文件中找到。文件前 20 行:\n${preview}`,
        isError: true,
      };
    }

    if (count > 1) {
      // 多次出现 → 让模型提供更多上下文来消歧
      return {
        output: `old_string 在文件中出现了 ${count} 次，必须唯一。请提供更多上下文使其唯一。`,
        isError: true,
      };
    }

    // 精确替换：只改一处，其余文件内容完全不变
    const updated = content.replace(oldStr, newStr);
    fs.writeFileSync(resolved, updated, "utf-8");

    const oldLines = oldStr.split("\n").length;
    const newLines = newStr.split("\n").length;
    const delta = newLines - oldLines;

    return {
      output: `已编辑 ${filePath}: 替换了 ${oldLines} 行 → ${newLines} 行 (${delta >= 0 ? "+" : ""}${delta})`,
    };
  },
});
