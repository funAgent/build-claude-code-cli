/**
 * s35 — MCP 客户端
 *
 * MCP (Model Context Protocol) 让 Agent 连接外部工具服务器。
 * 不需要为每个第三方服务都写一个内置工具——
 * 通过 MCP 协议动态发现和调用远程工具。
 *
 * 关键流程：
 * 1. 读取配置 → 连接 MCP 服务器（stdio/SSE/HTTP）
 * 2. tools/list → 发现可用工具
 * 3. 为每个 MCP 工具创建代理 Tool → 注册到工具池
 * 4. Agent 调用 mcp__server__tool → 转发到 MCP 服务器
 *
 * 对照 Claude Code: services/mcp/client.ts (~600 行)
 * - connectToServer: 按 transport 类型创建连接
 * - fetchToolsForClient: 工具发现 + mcp__ 前缀包装
 * - MCPConnectionManager: 连接生命周期 + 自动重连
 */

import { spawn, type ChildProcess } from "child_process";
import { buildTool, type Tool } from "./tool.js";

// ── 类型定义 ─────────────────────────────────────────────────

/**
 * MCP 服务器配置。
 * 对照 Claude Code: McpServerConfig（联合类型支持 stdio/sse/http/ws）
 * 教学版只实现 stdio 传输。
 */
export interface McpServerConfig {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * MCP 工具描述（从 tools/list 返回）。
 */
interface McpToolDescription {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP 连接状态。
 */
type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/**
 * MCP 客户端连接。
 */
export interface McpConnection {
  serverName: string;
  status: ConnectionStatus;
  tools: Tool[];
  process?: ChildProcess;
}

// ── MCP 工具命名 ─────────────────────────────────────────────

/**
 * 标准化名称用于 MCP 前缀。
 * 对照 Claude Code: normalizeNameForMCP()
 */
function normalizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/**
 * 构建 MCP 工具的完整名称。
 * 对照 Claude Code: buildMcpToolName()
 * 格式: mcp__<server>__<tool>
 */
export function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeName(serverName)}__${normalizeName(toolName)}`;
}

/**
 * 从 MCP 工具名解析出 server 和 tool。
 * 对照 Claude Code: mcpInfoFromString()
 */
export function parseMcpToolName(
  fullName: string,
): { serverName: string; toolName: string } | null {
  const parts = fullName.split("__");
  if (parts.length < 3 || parts[0] !== "mcp") return null;
  return { serverName: parts[1], toolName: parts.slice(2).join("__") };
}

// ── 连接管理 ─────────────────────────────────────────────────

/**
 * 通过 JSON-RPC over stdio 连接 MCP 服务器。
 *
 * 教学版简化：直接 spawn 子进程，通过 stdin/stdout 发送 JSON-RPC。
 * 对照 Claude Code: connectToServer() 支持 stdio/SSE/HTTP/WS 四种传输。
 */
export async function connectToMcpServer(
  serverName: string,
  config: McpServerConfig,
): Promise<McpConnection> {
  const connection: McpConnection = {
    serverName,
    status: "connecting",
    tools: [],
  };

  try {
    const child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    connection.process = child;

    // 初始化 MCP 协议
    await sendJsonRpc(child, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "build-claude-code", version: "1.0" },
    });

    // 发现工具
    const toolsResult = await sendJsonRpc(child, "tools/list", {});
    const mcpTools = (toolsResult as { tools: McpToolDescription[] }).tools ?? [];

    // 为每个 MCP 工具创建代理 Tool
    connection.tools = mcpTools.map((mcpTool) =>
      createMcpToolProxy(serverName, mcpTool, child),
    );

    connection.status = "connected";
  } catch (error) {
    connection.status = "error";
  }

  return connection;
}

/**
 * 为 MCP 工具创建本地代理 Tool。
 * Agent 调用此 Tool 时，实际通过 JSON-RPC 转发到 MCP 服务器。
 *
 * 对照 Claude Code: fetchToolsForClient() 中的工具包装逻辑
 */
function createMcpToolProxy(
  serverName: string,
  mcpTool: McpToolDescription,
  child: ChildProcess,
): Tool {
  const fullName = buildMcpToolName(serverName, mcpTool.name);

  return buildTool({
    name: fullName,
    description: `[MCP: ${serverName}] ${mcpTool.description}`,
    inputSchema: mcpTool.inputSchema as Tool["inputSchema"],
    isReadOnly: false,
    isConcurrencySafe: true,
    async call(input) {
      try {
        const result = await sendJsonRpc(child, "tools/call", {
          name: mcpTool.name,
          arguments: input,
        });

        const content = (result as { content: Array<{ text?: string }> }).content;
        const text = content?.map((c) => c.text ?? "").join("\n") ?? "";
        return { output: text || "(no output)" };
      } catch (error) {
        return {
          output: `MCP 工具调用失败: ${(error as Error).message}`,
          isError: true,
        };
      }
    },
  });
}

/**
 * 断开 MCP 连接。
 */
export function disconnectMcpServer(connection: McpConnection): void {
  if (connection.process) {
    connection.process.kill();
    connection.process = undefined;
  }
  connection.status = "disconnected";
  connection.tools = [];
}

// ── JSON-RPC 通信 ────────────────────────────────────────────

let requestId = 1;

function sendJsonRpc(
  child: ChildProcess,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = requestId++;
    const message = JSON.stringify({ jsonrpc: "2.0", id, method, params });

    const timeout = setTimeout(() => reject(new Error("MCP 请求超时")), 10000);

    let buffer = "";
    const onData = (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line);
          if (response.id === id) {
            clearTimeout(timeout);
            child.stdout?.off("data", onData);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch {
          // 不完整的 JSON，继续缓冲
        }
      }
    };

    child.stdout?.on("data", onData);
    child.stdin?.write(message + "\n");
  });
}
