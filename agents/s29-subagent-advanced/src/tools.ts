/**
 * s28 — 工具注册表（新增 AgentTool）
 *
 * 工具列表顺序保持稳定——对 prompt cache 命中率至关重要。
 * 新工具追加在末尾。
 */
import type { Tool } from "./tool.js";
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
import { todoWriteTool } from "./tools/todo-write.js";
import { agentTool } from "./tools/agent-tool.js";

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
    todoWriteTool, agentTool,
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
