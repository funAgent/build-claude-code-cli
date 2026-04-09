# s38 — Plugin System：第三方扩展

> **From a product to a platform — let the community extend you.**

`[ Phase 9: 扩展与集成 ]` · 工具数: 5 · 代码量: ~130 行

---

## 前置知识

- 需要完成: s37 会话持久化：断点续做

## 你将学到

- 插件架构设计：发现 → 验证 → 注册 → 管理的完整生命周期
- Plugin <abbr data-tip="描述插件元信息的配置文件（如 plugin.json），包含名称、版本、权限声明等，类似浏览器扩展的 manifest.json">Manifest</abbr>：plugin.json 校验、<abbr data-tip="语义化版本号格式 Major.Minor.Patch（如 1.2.3），用于表达版本的兼容性和变更级别">semver</abbr> 版本、路径安全防护
- 安全三道防线：Manifest 验证、策略控制、运行时隔离
- 插件与 MCP 集成：插件携带 MCP 服务器配置的合并与去重
- Marketplace 概念：集中发现、版本管理、安全审计

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

## 运行验证

```bash
cd agents/s38-plugin-system

# 1. 创建一个测试插件
mkdir -p .plugins/hello-plugin
cat > .plugins/hello-plugin/plugin.json << 'EOF'
{
  "name": "hello-plugin",
  "version": "1.0.0",
  "description": "测试插件",
  "permissions": ["file_read"]
}
EOF

# 2. 启动 Agent，观察插件加载
npm run dev
# → [plugin] Loaded hello-plugin@1.0.0
# → [plugin] Validated manifest: permissions OK

# 3. 验证插件注册与启用/禁用
#    > 列出已加载的插件
#    → 显示 hello-plugin 及其状态
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

<details>
<summary>练习 1 参考实现</summary>

创建一个带 MCP 服务器和 startup hook 的插件：

```
plugins/
└── deploy-notifier/
    ├── plugin.json
    └── hook.js
```

plugin.json:
```json
{
  "name": "deploy-notifier",
  "version": "1.0.0",
  "description": "部署完成后发送通知",
  "mcpServers": {
    "notify": {
      "command": "node",
      "args": ["./notify-server.js"]
    }
  },
  "hooks": {
    "onStartup": "node ./hook.js startup"
  },
  "permissions": ["bash"]
}
```

hook.js:
```javascript
// startup hook — 插件加载时执行
console.log("[deploy-notifier] Plugin loaded successfully");
// 可以在这里初始化环境变量、检查依赖等
```

**加载流程**：Plugin System 读取 plugin.json → 验证字段 → 注册 MCP 服务器配置 → 执行 startup hook → 插件就绪。

</details>

2. 实现 marketplace API：插件搜索、下载、版本管理
3. 添加插件沙箱：限制插件的文件系统和网络访问

## Phase 9 总结

恭喜完成 **扩展与集成** 阶段！你现在掌握了：

- [x] s35 MCP 客户端：JSON-RPC 通信与工具发现，mcp__ 命名空间
- [x] s36 MCP 服务端：双向生态，三层配置作用域合并
- [x] s37 会话持久化：JSONL 追加写入，断点续做与消息链
- [x] s38 Plugin System：Manifest 验证，安全边界，Marketplace 生态

> 从单体 Agent 到可扩展平台，你已具备连接外部世界与接受社区扩展的能力。

## 下一课预告

**s39 — 多 Agent 基础**：进入 Phase 10——多个 Agent 协同工作，从单兵作战到团队协作。
