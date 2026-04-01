# s36 — MCP 服务端 + 配置：让自己也能被调用

## 问题场景

你的 Agent CLI 有强大的工具集（bash、文件操作、搜索等）。其他工具想调用这些能力怎么办？

```
双向 MCP 生态：

  IDE / 编排器                     你的 CLI
      ↓ MCP client                   ↓ MCP client
  ┌──── 你的 CLI ─────┐      ┌──── GitHub MCP ────┐
  │  作为 MCP server   │      │  作为 MCP server    │
  │  暴露内置工具       │      │  暴露 GitHub API   │
  └───────────────────┘      └──────────────────┘

  你的 CLI 既是客户端（调用别人）也是服务端（被别人调用）
```

## 设计决策

### mcp serve 子命令

```
mcp serve 工作流：

  $ my-cli mcp serve
                ↓
  ┌─── 启动 MCP 服务端 ───────┐
  │                            │
  │  stdin ← JSON-RPC 请求     │
  │  stdout → JSON-RPC 响应    │
  │                            │
  │  支持的方法:               │
  │  • initialize              │
  │  • tools/list → 内置工具    │
  │  • tools/call → 执行工具   │
  └────────────────────────────┘
                ↓
  宿主程序（IDE/另一个 Agent）通过 stdin/stdout 调用
```

### 配置管理架构

```
三层配置作用域：

  ~/.agent-cli/mcp.json     ← user 全局配置
  .mcp.json                 ← project 项目配置（可提交到 git）
  .mcp.local.json           ← local 本地覆盖（不提交）

  合并优先级: user < project < local
  （后者覆盖前者，同名服务器以高优先级为准）
```

### 配置管理命令

```
CLI 子命令：

  mcp add github -- npx @mcp/github      # 添加 MCP 服务器
  mcp add github -s user                   # 添加到 user 作用域
  mcp remove github                        # 移除
  mcp list                                 # 列出所有配置
```

## 实现

### MCP 服务端

```typescript
export function startMcpServer(tools: Tool[]): void {
  const toolMap = new Map(tools.map(t => [t.name, t]));

  process.stdin.on("data", async (data) => {
    const request = JSON.parse(data.toString());
    const response = await handleJsonRpcRequest(request, toolMap);
    process.stdout.write(JSON.stringify(response) + "\n");
  });
}
```

### 配置合并

```typescript
export function getMergedMcpConfig(cwd): Record<string, McpServerConfig> {
  const merged = {};
  // 按优先级合并: user < project < local
  for (const scope of ["user", "project", "local"]) {
    Object.assign(merged, loadConfig(getConfigPath(scope, cwd)).mcpServers);
  }
  return merged;
}
```

## 对照 Claude Code

| 维度 | 教学版 (s36) | Claude Code |
|------|-------------|-------------|
| 服务端传输 | stdio | stdio (StdioServerTransport) |
| 暴露能力 | 内置工具 | 内置工具 + 待定其他 MCP |
| 配置格式 | McpJsonConfig | 同 + 企业 managed-mcp.json |
| 作用域 | user/project/local | 同 + plugin + enterprise |
| 配置去重 | 无 | 签名去重（dedupPluginMcpServers） |
| 策略控制 | 无 | allowlist/denylist 策略 |

## 深入思考

1. **双向性是生态关键**：客户端让你调用别人，服务端让别人调用你。两者结合才形成真正的生态。
2. **配置分层解决团队协作**：project 配置提交到 git 供团队共享，local 配置覆盖个人偏好，user 配置全局生效。
3. **服务端只暴露已有工具**：`mcp serve` 不需要额外代码——它只是用不同的接口暴露你已经实现的 Tool。

## 练习

1. 用另一个 MCP 客户端连接你的 `mcp serve`，验证工具调用
2. 添加 Resources 支持：让 MCP 服务端暴露文件等资源
3. 实现配置的策略控制：添加 allowlist/denylist
