/**
 * s30 — ToolSearchTool（工具搜索）
 *
 * 当工具数量很多时（尤其加上 MCP 工具），不能全部放在 system prompt 中。
 * ToolSearchTool 让 Agent 按需搜索和发现可用的工具。
 *
 * 关键概念：deferred tools（延迟工具）
 * - 不在初始 system prompt 中列出
 * - Agent 通过 tool_search 发现并加载
 * - 减少初始 prompt 的 token 消耗
 *
 * 对照 Claude Code: tools/ToolSearchTool/ToolSearchTool.ts
 * - isDeferredTool 标记延迟加载的工具
 * - 关键词搜索 + select: 直接选择
 * - 返回 tool_reference blocks
 */

import { buildTool, type Tool } from "../tool.js";

// 延迟工具注册表（由 tools.ts 初始化）
let deferredTools: Tool[] = [];

/**
 * 注册延迟加载的工具。
 */
export function registerDeferredTools(tools: Tool[]): void {
  deferredTools = tools;
}

export const toolSearchTool = buildTool({
  name: "tool_search",
  description:
    "搜索可用的工具。当你不确定有哪些工具可用，或需要查找特定功能的工具时使用。" +
    "返回匹配的工具名称和描述。",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "搜索关键词（工具名称或功能描述）",
      },
    },
    required: ["query"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input) {
    const query = (input.query as string).toLowerCase();

    // 搜索所有延迟工具
    const matches = deferredTools.filter(
      (tool) =>
        tool.name.toLowerCase().includes(query) ||
        tool.description.toLowerCase().includes(query),
    );

    if (matches.length === 0) {
      return {
        output: `未找到匹配 "${query}" 的工具。`,
      };
    }

    const results = matches
      .map(
        (t) =>
          `工具: ${t.name}\n  描述: ${t.description}\n  只读: ${t.isReadOnly ? "是" : "否"}`,
      )
      .join("\n\n");

    return {
      output: `找到 ${matches.length} 个匹配的工具:\n\n${results}`,
    };
  },
});
