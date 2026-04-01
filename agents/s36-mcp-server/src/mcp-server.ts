/**
 * s36 — MCP 服务端 + 配置管理
 *
 * 让你的 CLI 既是 MCP 客户端也是 MCP 服务端。
 * 其他工具（IDE、编排器）可以通过 MCP 协议调用你的 Agent 能力。
 *
 * 关键流程：
 * 1. mcp serve → 启动 stdio MCP 服务端，暴露内置工具
 * 2. mcp add/remove/list → 管理 MCP 服务器配置
 * 3. 配置合并：plugin < user < project < local（后者覆盖前者）
 *
 * 对照 Claude Code:
 * - entrypoints/mcp.ts → startMCPServer（~100 行）
 * - cli/handlers/mcp.tsx → add/remove/list 子命令
 * - services/mcp/config.ts → 配置合并与策略（~800 行）
 */

import type { Tool } from "./tool.js";

// ── 类型定义 ─────────────────────────────────────────────────

export type McpConfigScope = "user" | "project" | "local";

/**
 * MCP 服务器配置格式（与 s35 一致）。
 */
export interface McpServerConfig {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * 完整的 MCP 配置文件格式。
 * 对照 Claude Code: McpJsonConfig
 */
export interface McpJsonConfig {
  mcpServers: Record<string, McpServerConfig>;
}

// ── MCP 服务端 ───────────────────────────────────────────────

/**
 * 启动 MCP 服务端，把内置工具暴露为 MCP 服务。
 *
 * 对照 Claude Code: entrypoints/mcp.ts → startMCPServer
 * - 创建 MCP SDK Server 实例
 * - ListTools 返回内置工具列表
 * - CallTool 路由到对应 Tool.call
 * - 使用 StdioServerTransport
 */
export function startMcpServer(tools: Tool[]): void {
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  process.stdin.on("data", async (data) => {
    const lines = data.toString().split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const request = JSON.parse(line);
        const response = await handleJsonRpcRequest(request, toolMap);
        if (response) {
          process.stdout.write(JSON.stringify(response) + "\n");
        }
      } catch {
        // 忽略无效 JSON
      }
    }
  });
}

async function handleJsonRpcRequest(
  request: { id?: number; method: string; params?: Record<string, unknown> },
  toolMap: Map<string, Tool>,
): Promise<Record<string, unknown> | null> {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "build-claude-code", version: "1.0" },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: Array.from(toolMap.values()).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        },
      };

    case "tools/call": {
      const toolName = (params as { name: string })?.name;
      const args = (params as { arguments?: Record<string, unknown> })?.arguments ?? {};
      const tool = toolMap.get(toolName);

      if (!tool) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Tool not found: ${toolName}` },
        };
      }

      try {
        const result = await tool.call(args);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: result.output }],
            isError: result.isError ?? false,
          },
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: (error as Error).message },
        };
      }
    }

    case "notifications/initialized":
      return null;

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ── 配置管理 ──────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

function getConfigPath(scope: McpConfigScope, cwd: string): string {
  switch (scope) {
    case "user":
      return join(homedir(), ".agent-cli", "mcp.json");
    case "project":
      return join(cwd, ".mcp.json");
    case "local":
      return join(cwd, ".mcp.local.json");
  }
}

function loadConfig(path: string): McpJsonConfig {
  if (!existsSync(path)) return { mcpServers: {} };
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { mcpServers: {} };
  }
}

function saveConfig(path: string, config: McpJsonConfig): void {
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

/**
 * 添加 MCP 服务器配置。
 * 对照 Claude Code: commands/mcp/addCommand.ts
 */
export function addMcpServer(
  name: string,
  config: McpServerConfig,
  scope: McpConfigScope = "project",
  cwd: string = process.cwd(),
): void {
  const path = getConfigPath(scope, cwd);
  const existing = loadConfig(path);
  existing.mcpServers[name] = config;
  saveConfig(path, existing);
}

/**
 * 移除 MCP 服务器配置。
 */
export function removeMcpServer(
  name: string,
  scope: McpConfigScope = "project",
  cwd: string = process.cwd(),
): void {
  const path = getConfigPath(scope, cwd);
  const existing = loadConfig(path);
  delete existing.mcpServers[name];
  saveConfig(path, existing);
}

/**
 * 列出所有 MCP 服务器配置。
 */
export function listMcpServers(cwd: string = process.cwd()): Array<{
  name: string;
  config: McpServerConfig;
  scope: McpConfigScope;
}> {
  const results: Array<{ name: string; config: McpServerConfig; scope: McpConfigScope }> = [];

  for (const scope of ["user", "project", "local"] as McpConfigScope[]) {
    const path = getConfigPath(scope, cwd);
    const config = loadConfig(path);
    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      results.push({ name, config: serverConfig, scope });
    }
  }

  return results;
}

/**
 * 合并所有 scope 的 MCP 配置。
 * 优先级：local > project > user（后者覆盖前者）。
 *
 * 对照 Claude Code: getClaudeCodeMcpConfigs()
 * - 合并 plugin < user < project < local
 * - 签名去重（dedupPluginMcpServers）
 * - 企业策略过滤（isMcpServerAllowedByPolicy）
 */
export function getMergedMcpConfig(
  cwd: string = process.cwd(),
): Record<string, McpServerConfig> {
  const merged: Record<string, McpServerConfig> = {};

  for (const scope of ["user", "project", "local"] as McpConfigScope[]) {
    const path = getConfigPath(scope, cwd);
    const config = loadConfig(path);
    Object.assign(merged, config.mcpServers);
  }

  return merged;
}
