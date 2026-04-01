/**
 * 工具注册表（复用 s12）
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
  get(name: string): Tool | undefined;
  toApiTools(): Anthropic.Tool[];
}

export function assembleToolPool(options: {
  readOnlyMode?: boolean;
} = {}): ToolRegistry {
  const allTools: Tool[] = [
    globTool, grepTool, lsTool, fileReadTool,
    fileWriteTool, fileEditTool, bashTool, taskTool, helpTool,
  ];
  const toolMap = new Map(allTools.map((t) => [t.name, t]));
  const filtered = options.readOnlyMode
    ? allTools.filter((t) => t.isReadOnly)
    : allTools;

  return {
    getAll: () => filtered,
    get: (name) => toolMap.get(name),
    toApiTools: () => toAnthropicTools(filtered),
  };
}
