/**
 * s12 — HelpTool: 列出所有可用工具
 */
import { buildTool, type ToolResult } from "../tool.js";

export const helpTool = buildTool({
  name: "help",
  description: "List all available tools and their descriptions.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
  isReadOnly: true,
  async call(): Promise<ToolResult> {
    return {
      output: [
        "Available tools:",
        "  bash        - Execute shell commands",
        "  file_read   - Read file contents with line numbers",
        "  file_write  - Write content to a file",
        "  file_edit   - Replace a unique string in a file",
        "  glob        - Find files by pattern",
        "  grep        - Search file contents by regex",
        "  ls          - List directory contents",
        "  task        - Manage a simple task list",
        "  help        - Show this help message",
      ].join("\n"),
    };
  },
});
