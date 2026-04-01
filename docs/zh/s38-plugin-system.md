# s38 — Plugin System：第三方扩展

## 问题场景

MCP 解决了工具的外部连接，但用户想要更深层的定制——自定义 hooks、UI 组件、工作流。

```
MCP vs Plugin 的区别：

  MCP:    标准化工具协议，专注于"调用"
          → 外部工具服务器提供 tools/resources

  Plugin: 深度集成扩展，专注于"扩展"
          → 修改 Agent 行为、注入配置、添加生命周期 hooks

  plugin.json:
  {
    "name": "my-plugin",
    "version": "1.0.0",
    "description": "My awesome plugin",
    "mcpServers": { ... },          ← 可以携带 MCP 服务器
    "hooks": { "onStartup": "..." }, ← 可以注入 hooks
    "permissions": ["bash"]          ← 声明所需权限
  }
```

## 设计决策

### 插件架构

```
插件系统架构：

  ┌─── 发现 ──────────────────┐
  │ marketplace (远程仓库)     │
  │ 本地目录 (~/.agent-cli/plugins/) │
  │ session-only (--plugin-dir)│
  └──────────┬────────────────┘
             ↓
  ┌─── 验证 ──────────────────┐
  │ plugin.json manifest 校验  │
  │ 版本格式 (semver)          │
  │ 路径安全 (无目录穿越)       │
  │ 策略检查 (allowlist/deny)  │
  └──────────┬────────────────┘
             ↓
  ┌─── 注册 ──────────────────┐
  │ MCP 服务器 → 配置合并      │
  │ Hooks → 生命周期注入       │
  │ 状态 → 持久化启用/禁用     │
  └──────────┬────────────────┘
             ↓
  ┌─── 管理 ──────────────────┐
  │ install / uninstall        │
  │ enable / disable           │
  │ update (版本升级)          │
  └───────────────────────────┘
```

### 安全边界

```
插件安全三道防线：

  第 1 道: Manifest 验证
  ├── 必需字段完整
  ├── 版本格式合法
  └── 路径安全（name 不含 ".." 或 "/"）

  第 2 道: 策略控制
  ├── 企业 managed 策略
  ├── blocklist / allowlist
  └── enabledPlugins 开关

  第 3 道: 运行时隔离
  ├── 插件 MCP 与用户配置签名去重
  ├── 权限声明必须匹配
  └── 缓存路径 sanitize 防穿越
```

## 实现

### 插件 Manifest

```typescript
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  mcpServers?: Record<string, McpServerConfig>;
  hooks?: { onStartup?: string; onShutdown?: string };
  permissions?: string[];
}
```

### 插件加载

```typescript
export function loadAllPlugins(): LoadedPlugin[] {
  const pluginsDir = getPluginsDir();

  for (const entry of readdirSync(pluginsDir)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const validation = validateManifest(manifest);
    if (!validation.valid) continue;  // 验证失败跳过

    registry.plugins.set(manifest.name, {
      id: manifest.name,
      manifest,
      path: pluginDir,
      source: "local",
      enabled: isPluginEnabled(manifest.name),
    });
  }
}
```

### 插件提供的 MCP

```typescript
export function getPluginMcpServers() {
  const servers = {};
  for (const plugin of registry.plugins.values()) {
    if (!plugin.enabled || !plugin.manifest.mcpServers) continue;
    for (const [name, config] of Object.entries(plugin.manifest.mcpServers)) {
      servers[`${plugin.id}/${name}`] = config;  // 插件名/服务器名
    }
  }
  return servers;
}
```

## 对照 Claude Code

| 维度 | 教学版 (s38) | Claude Code |
|------|-------------|-------------|
| 发现源 | 本地目录 | marketplace + local + session + npm |
| Manifest | 手动校验 | Zod schema (PluginManifestSchema) |
| 安全 | 基础路径检查 | 企业策略 + blocklist + 路径 sanitize |
| Marketplace | 概念展示 | 完整 API (getPluginById, 版本管理) |
| MCP 集成 | 直接注入 | 签名去重 (dedupPluginMcpServers) |
| 状态管理 | JSON 文件 | 同 + 企业 policySettings |

## 深入思考

1. **从工具到平台**：插件系统让你的产品成为平台。MCP 是"连接"，Plugin 是"扩展"——两者互补。
2. **安全是第一优先级**：第三方代码运行在你的进程中，每一层验证都不能省。manifest 校验、策略控制、运行时隔离缺一不可。
3. **Marketplace 是生态枢纽**：集中管理插件发现、版本、安全审计。没有 marketplace 的插件系统只是文件加载器。

## 练习

1. 创建一个真实的插件：提供自定义 MCP 服务器 + startup hook
2. 实现 marketplace API：插件搜索、下载、版本管理
3. 添加插件沙箱：限制插件的文件系统和网络访问
