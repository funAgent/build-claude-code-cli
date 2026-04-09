# s35 — MCP 客户端：连接外部工具

> **Don't build every tool; let the ecosystem build them.**

`[ Phase 9: 扩展与集成 ]` · 工具数: 3 · 代码量: ~120 行

---

## 前置知识

- 需要完成: s34 子 Agent 权限：继承与隔离

## 你将学到

- MCP 协议架构：<abbr data-tip="基于 JSON 的远程过程调用协议，通过发送 {method, params, id} 请求并接收 {result, id} 响应完成跨进程通信">JSON-RPC</abbr> 通信与工具发现流程
- 连接 MCP 服务器：spawn 子进程、初始化、工具列表获取
- mcp__ 命名规范：代理工具的前缀命名空间与权限匹配
- <abbr data-tip="将远程工具封装为本地对象的设计模式，调用方无需知道底层通信细节，类似前端的 API 封装层">工具代理模式</abbr>：将 MCP 远程工具封装为本地 Tool 对象

## 问题场景

你的 Agent 需要查数据库、调 GitHub API、操作 Slack。为每个服务都写一个内置工具？

```
工具扩展的困境：

  内置工具:
  ├── bash, file_read, file_write ...  ← 你写的
  ├── github_create_pr               ← 你也得写
  ├── slack_send_message              ← 你也得写
  ├── postgres_query                  ← 你也得写
  └── ... 无穷无尽

  问题: 不可能为每个第三方服务都写工具
```

**Don't build every tool; let the ecosystem build them.**

## 设计决策

### MCP 协议架构

```
MCP 的角色：

  你的 Agent (MCP 客户端)
       ↓ JSON-RPC
  ┌─ MCP 服务器 A ──────────┐
  │  GitHub 工具             │
  │  - create_pr             │
  │  - list_issues           │
  └──────────────────────────┘
       ↓ JSON-RPC
  ┌─ MCP 服务器 B ──────────┐
  │  Database 工具           │
  │  - query                 │
  │  - list_tables           │
  └──────────────────────────┘

  Agent 不需要知道 GitHub API 的细节
  MCP 服务器封装了所有细节
  Agent 只需要调用标准化的工具接口
```

### 连接流程

```
MCP 客户端工作流：

  1. 读取配置
     ┌──────────────────────────────┐
     │ mcpServers: {                │
     │   "github": {                │
     │     command: "npx",          │
     │     args: ["@mcp/github"]    │
     │   }                          │
     │ }                            │
     └──────────┬───────────────────┘
                ↓
  2. spawn 子进程 + JSON-RPC initialize
                ↓
  3. tools/list → 发现可用工具
     ┌──────────────────────────────┐
     │ tools: [                     │
     │   { name: "create_pr", ... } │
     │   { name: "list_issues", ...}│
     │ ]                            │
     └──────────┬───────────────────┘
                ↓
  4. 创建代理 Tool + mcp__ 前缀
     mcp__github__create_pr
     mcp__github__list_issues
                ↓
  5. 注册到工具池 → Agent 可用
```

### mcp__ 命名规范

```
工具命名：mcp__<server>__<tool>

  MCP 服务器: "github"
  MCP 工具:   "create_pr"
  → Agent 工具名: mcp__github__create_pr

  为什么需要前缀?
  • 避免与内置工具名冲突
  • 权限规则可以按 server 匹配: mcp__github (允许 github 所有工具)
  • 用户一眼能看出是来自哪个 MCP 服务器
```

## 实现

### MCP 服务器配置

```typescript
export interface McpServerConfig {
  type?: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}
```

### 连接 + 工具发现

```typescript
export async function connectToMcpServer(
  serverName: string, config: McpServerConfig
): Promise<McpConnection> {
  // 1. spawn 子进程
  const child = spawn(config.command, config.args ?? []);

  // 2. 初始化 MCP 协议
  await sendJsonRpc(child, "initialize", { protocolVersion: "2024-11-05" });

  // 3. 发现工具
  const result = await sendJsonRpc(child, "tools/list", {});

  // 4. 为每个工具创建代理
  const tools = result.tools.map(mcpTool =>
    createMcpToolProxy(serverName, mcpTool, child)
  );

  return { serverName, status: "connected", tools };
}
```

### 工具代理

```typescript
function createMcpToolProxy(serverName, mcpTool, child): Tool {
  return buildTool({
    name: buildMcpToolName(serverName, mcpTool.name), // mcp__github__create_pr
    description: `[MCP: ${serverName}] ${mcpTool.description}`,
    async call(input) {
      // 转发到 MCP 服务器
      const result = await sendJsonRpc(child, "tools/call", {
        name: mcpTool.name,
        arguments: input,
      });
      return { output: result.content.map(c => c.text).join("\n") };
    },
  });
}
```

## 运行验证

```bash
cd agents/s35-mcp-client
npm run dev

# 1. 启动后观察 MCP 服务器连接日志
#    → [mcp] Connecting to github-mcp via stdio...
#    → [mcp] Connected. Discovered 12 tools.

# 2. 让 Agent 调用 MCP 工具
#    > 帮我查一下 GitHub 上的 open issues
#    → Agent 调用 mcp__github__list_issues
#    → 工具名前缀 mcp__<server>__<tool> 表示代理调用

# 3. 观察 JSON-RPC 通信
#    → initialize → tools/list → tools/call 完整流程
```

## 对照 Claude Code

| 维度 | 教学版 (s35) | Claude Code |
|------|-------------|-------------|
| 传输类型 | 仅 stdio | stdio / SSE / HTTP / WebSocket / SDK / claude.ai proxy |
| 工具发现 | tools/list | tools/list + prompts/list + resources/list + skills |
| 连接管理 | 手动连接/断开 | MCPConnectionManager + 自动重连 + 指数退避 |
| 动态刷新 | 无 | tools/list_changed 事件 → 自动重新发现 |
| 认证 | 无 | ClaudeAuthProvider + OAuth 流程 |
| 命名 | mcp__server__tool | 同 + normalizeNameForMCP + SDK 可跳过前缀 |

## 深入思考

1. **MCP 是工具的"USB 接口"**：标准化的连接协议让任何人都能写工具服务器，你的 Agent 不需要改代码就能使用新工具。
2. **mcp__ 前缀是命名空间**：防止第三方工具名与内置工具冲突。权限系统也利用这个前缀做粗粒度控制（`mcp__github` 允许 GitHub 所有工具）。
3. **代理模式**：Agent 调用的是本地 Tool 对象，但实际执行发生在 MCP 服务器进程中。这种代理模式让 Agent 完全不知道底层协议细节。

## 练习

1. 连接一个真实的 MCP 服务器（如 `@modelcontextprotocol/server-filesystem`），观察工具发现过程
2. 实现 SSE 传输层：支持连接远程 MCP 服务器
3. 添加自动重连：连接断开后指数退避重试

<details>
<summary>练习 3 参考实现</summary>

MCP 连接自动重连与指数退避：

```typescript
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

async function connectWithRetry(
  serverName: string,
  config: McpServerConfig,
  retries = 0,
): Promise<McpConnection> {
  try {
    return await connectToMcpServer(serverName, config);
  } catch (error) {
    if (retries >= MAX_RETRIES) throw error;

    const delay = BASE_DELAY_MS * Math.pow(2, retries); // 指数退避
    console.log(`[mcp] ${serverName} 连接失败，${delay}ms 后重试...`);

    await new Promise(r => setTimeout(r, delay));
    return connectWithRetry(serverName, config, retries + 1);
  }
}

// 监听子进程退出 → 触发重连
child.on("exit", () => {
  console.log(`[mcp] ${serverName} 断开，正在重连...`);
  connection = connectWithRetry(serverName, config);
});
```

**指数退避**：每次重试间隔翻倍（1s → 2s → 4s → 8s → 16s），避免在服务端不可用时产生连接风暴。

</details>

## 下一课预告

**s36 — MCP 服务端 + 配置**：不仅调用别人的工具，也让自己能被调用——实现 MCP Server 模式与三层配置管理。
