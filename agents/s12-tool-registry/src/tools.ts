/**
 * s12 — 工具注册表
 *
 * 统一管理所有工具的注册、排序和查找。
 * 注册表的排序必须稳定——因为 prompt cache 依赖 tools 列表前缀一致。
 *
 * 对照 Claude Code: tools.ts (assembleToolPool)
 * 生产版的注册表还包含：
 * - 条件加载（根据 permission mode 过滤工具）
 * - 工具分组（读/写/危险）
 * - 工具搜索（ToolSearchTool）
 * - 延迟加载（isDeferredTool）
 */

import type { Tool, ToolContext } from "./tool.js";
import { toAnthropicTools } from "./tool.js";
import type Anthropic from "@anthropic-ai/sdk";

import { bashTool } from "./tools/bash.js";
import { fileReadTool } from "./tools/file-read.js";
import { fileWriteTool } from "./tools/file-write.js";
import { fileEditTool } from "./tools/file-edit.js";
import { globTool } from "./tools/glob.js";
import { grepTool } from "./tools/grep.js";
import { lsTool } from "./tools/ls.js";
import { taskTool } from "./tools/task.js";
import { helpTool } from "./tools/help.js";

export interface ToolRegistry {
  getAll(): Tool[];
  getReadOnly(): Tool[];
  getWritable(): Tool[];
  get(name: string): Tool | undefined;
  toApiTools(): Anthropic.Tool[];
}

/**
 * 组装工具池
 *
 * 关键设计：工具列表排序稳定。
 * 因为 Anthropic API 的 prompt cache 依赖 tools 参数前缀一致，
 * 如果排序不稳定，cache 命中率会大幅降低。
 */
export function assembleToolPool(options: {
  readOnlyMode?: boolean;
} = {}): ToolRegistry {
  // 工具列表的顺序是固定的——这不是偶然，而是 prompt cache 的要求
  // API 请求中 tools 参数会被编码进 system prompt 前缀
  // 如果顺序变了，前缀就变了，cache 就 miss 了
  const allTools: Tool[] = [
    globTool,     // 读：文件搜索（最高频）
    grepTool,     // 读：内容搜索
    lsTool,       // 读：目录列表
    fileReadTool, // 读：文件读取
    fileWriteTool,// 写：文件创建/覆写
    fileEditTool, // 写：精确替换
    bashTool,     // 写：Shell 命令
    taskTool,     // 写：子任务
    helpTool,     // 读：帮助信息
  ];

  // name → Tool 映射，O(1) 查找。Agent 循环中每个 tool_use block 都要查
  const toolMap = new Map(allTools.map((t) => [t.name, t]));

  // readOnlyMode 下过滤掉写工具——这是权限系统的基础
  const filtered = options.readOnlyMode
    ? allTools.filter((t) => t.isReadOnly)
    : allTools;

  return {
    getAll: () => filtered,
    getReadOnly: () => allTools.filter((t) => t.isReadOnly),
    getWritable: () => allTools.filter((t) => !t.isReadOnly),
    get: (name) => toolMap.get(name),
    toApiTools: () => toAnthropicTools(filtered),
  };
}
