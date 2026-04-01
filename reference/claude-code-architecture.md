# Claude Code 架构参考速查

> 源码分析基于 `/Users/wang/workspace/GitHub/mini-claude-code-cli/claude-code-best/`（CCB 项目）
>
> 本文档为 build-claude-code 项目每课提供 Claude Code 源码的架构对照参考。
> 编写教学代码、文档、annotations 时必须参考对应章节，确保架构对齐。

---

## 源码项目结构总览

```
claude-code-best/src/
├── entrypoints/cli.tsx       # 真正入口，注入 polyfill
├── main.tsx                  # Commander.js CLI 定义（~1000 行）
├── query.ts                  # 核心 query 函数（~1700 行）
├── QueryEngine.ts            # 会话引擎（~1300 行）
├── Tool.ts                   # Tool 类型定义 + 工具工厂
├── tools.ts                  # 工具注册表 assembleToolPool
├── tools/                    # 每工具一个目录
│   ├── BashTool/
│   ├── FileReadTool/
│   ├── FileEditTool/
│   ├── FileWriteTool/
│   ├── GrepTool/
│   ├── GlobTool/
│   ├── AgentTool/
│   ├── TodoWriteTool/
│   ├── WebFetchTool/
│   ├── WebSearchTool/
│   └── ...
├── context.ts                # 上下文构建（git/CLAUDE.md/memory）
├── screens/REPL.tsx           # 主交互屏幕
├── components/               # Ink UI 组件
│   ├── Messages.tsx
│   ├── PromptInput/
│   └── permissions/
├── services/
│   ├── api/claude.ts         # API 客户端（~3400 行）
│   ├── mcp/                  # MCP 客户端/服务端
│   ├── compact/              # 上下文压缩
│   ├── plugins/              # 插件系统
│   └── tools/StreamingToolExecutor.ts
├── state/
│   ├── AppState.tsx          # 全局状态
│   └── store.ts              # Zustand store
├── types/
│   ├── message.ts            # 消息类型层级
│   └── permissions.ts        # 权限类型
├── utils/
│   ├── permissions/          # 权限规则引擎
│   ├── claudemd.ts           # CLAUDE.md 加载
│   ├── config.ts             # 多层配置
│   ├── model/providers.ts    # 多 Provider 支持
│   ├── sessionStorage.ts     # 会话持久化
│   ├── worktree.ts           # Git Worktree 隔离
│   └── swarm/                # 多 Agent 团队
│       ├── teammateMailbox.ts
│       └── permissionSync.ts
└── ink/                      # 自定义 Ink 框架（内部 fork）
```

关键架构文档：
- **`claude-code-best/CLAUDE.md`** — 模块职责映射（最重要的单文件索引）
- **`claude-code-best/README.md`** — 能力清单/工具表/Feature Flag 列表
- **`claude-code-best/RECORD.md`** — 开发日志和文件修复记录

---

## Phase 0: 预备知识（s00-s02）

### s00 — AI API 入门

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/services/api/claude.ts` |
| 核心函数 | `createMessage()` / `streamMessage()` |
| 关键设计 | SDK 封装 + 多 Provider 支持（Anthropic/Bedrock/Vertex/Azure） |

**架构要点：**
- `claude.ts` 约 3400 行，是整个 API 层的核心
- 同时支持同步和流式调用，默认流式
- Provider 选择在 `src/utils/model/providers.ts`
- beta header 注入、cache_control 标记都在这里处理

### s01 — CLI 脚手架

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/entrypoints/cli.tsx` + `src/main.tsx` |
| CLI 框架 | Commander.js（`src/main.tsx` 中定义所有子命令） |
| 打包 | `bun build --outdir dist --target bun`（我们用 esbuild） |

**架构要点：**
- `cli.tsx` 极薄（~100 行），只做 polyfill 注入和 `main()` 调用
- `main.tsx` 约 1000 行，定义了 `claude`、`mcp`、`auth`、`plugin` 等子命令
- 快速路径：`--version`、`--help` 等不需要 AI 的命令跳过重量级模块加载
- 入口/逻辑分离是 Claude Code 的核心分层原则

### s02 — 子进程与安全执行

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/tools/BashTool/BashTool.tsx` |
| 安全 | `src/utils/permissions/permissions.ts`（6300+ 行） |
| 沙箱 | macOS `sandbox-exec` 限制文件系统访问 |

**架构要点：**
- BashTool 使用 `spawn`，支持超时（SIGTERM → SIGKILL 两阶段）
- 安全是多层的：正则快筛 → AI 分类器 → 交互式确认
- `stdio: ["pipe", "pipe", "pipe"]` — 生产版支持 stdin pipe（交互式命令）
- 输出处理：token 预算 + 磁盘替换（大输出不保留在内存）

---

## Phase 1: 最小 Agent（s03-s07）

### s03 — Agent Loop

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/query.ts`（~1700 行） |
| 核心函数 | `query()` → 内部 while 循环 |
| 循环条件 | `stop_reason === "tool_use"` |

**架构要点：**
- `query.ts` 是整个 Agent 的心脏
- 循环结构：`while (true)` + 内部判断 `stop_reason`
- 每轮循环：发送 messages → 收到响应 → 处理 tool_use → 执行工具 → 把 tool_result push 回 messages → 继续
- 错误处理在循环内，不让循环崩溃
- 自动压缩检查在每轮循环结束时

### s04 — 消息管理

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/types/message.ts` + `src/utils/messages.ts` |
| 消息类型 | UserMessage / AssistantMessage / ToolUseMessage / ToolResultMessage |
| 格式化 | 消息截断、token 计数、序列化 |

**架构要点：**
- 消息不是简单字符串数组，而是有严格类型的结构
- `content` 字段是 `ContentBlock[]`（文本/工具调用/思考过程）
- 消息管理的核心难题：长对话时 messages 数组增长的控制

### s05 — 错误处理

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/query.ts`（错误恢复段落） |
| 核心策略 | 工具错误作为 tool_result 返回给模型 |
| API 重试 | 指数退避 + 自动降级到备用模型 |

**架构要点：**
- 工具执行失败不抛异常，而是构造 `is_error: true` 的 tool_result
- 模型看到错误后会自己修正（比如换个命令重试）
- API 层错误才做重试：429（限速）、500（服务端）、网络超时
- 重试策略：指数退避 + 最大重试次数 + prompt-too-long 特殊处理

### s06 — 配置管理

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/utils/config.ts` |
| 配置层级 | CLI 参数 > 环境变量 > 项目 `.claude/` > 全局 `~/.claude/` > 默认值 |
| 持久化 | JSON 文件存储 |

**架构要点：**
- 配置优先级链是 Claude Code 的设计模式
- `settings.json` 支持 per-project 和 global 两级
- hooks 配置也在 settings.json 中（pre/post tool use）

### s07 — 成本追踪

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/bootstrap/state.ts`（token 计数器） |
| 追踪维度 | input_tokens / output_tokens / cache_read / cache_creation |
| UI | `/cost` 命令 + 状态栏实时显示 |

**架构要点：**
- 每次 API 响应的 `usage` 字段累加到全局计数器
- 成本按模型定价计算（不同模型单价不同）
- 状态栏始终显示当前会话总花费

---

## Phase 2: 工具体系（s08-s12）

### s08 — Tool 抽象

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/Tool.ts` |
| 核心类型 | `Tool { name, description, inputSchema, call(), isEnabled?, isReadOnly? }` |
| 工厂 | `buildTool()` / `findToolByName()` |

**架构要点：**
- Tool 是 name + schema + call 三元组
- `isReadOnly` 标记决定工具是否可以并行执行
- `needsPermissions` 标记决定是否需要用户审批
- 工具的 React 组件（`.tsx`）负责渲染工具调用结果

### s09 — 文件工具

| 维度 | Claude Code 对应 |
|------|-----------------|
| FileRead | `src/tools/FileReadTool/FileReadTool.tsx` |
| FileWrite | `src/tools/FileWriteTool/FileWriteTool.tsx` |
| 路径安全 | `validateFilePath()` — 防止路径遍历攻击 |

**架构要点：**
- FileReadTool 支持：文件/PDF/图片/Notebook
- 读取结果带行号（方便模型定位编辑）
- FileWriteTool 生成 diff 记录变更历史
- 路径安全检查：禁止 `../` 越界、禁止写入 `node_modules/`

### s10 — 编辑工具

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/tools/FileEditTool/FileEditTool.ts` |
| 编辑方式 | `old_string → new_string` 精确替换 |
| 安全检查 | 唯一性验证（old_string 必须在文件中只出现一次） |

**架构要点：**
- 为什么不用整文件覆写？节省 90% token
- 唯一性检查：如果 old_string 匹配多处，拒绝执行并要求模型提供更多上下文
- diff 预览：编辑前生成 unified diff 给用户审阅

### s11 — 搜索工具

| 维度 | Claude Code 对应 |
|------|-----------------|
| Glob | `src/tools/GlobTool/` — 文件模式搜索 |
| Grep | `src/tools/GrepTool/` — 内容搜索（ripgrep） |

**架构要点：**
- 搜索是 Agent 最高频的工具
- GrepTool 底层调用 ripgrep（rg），支持正则、文件类型过滤
- 搜索结果有输出大小限制，超过则截断
- Claude Code 内部有 bfs/ugrep 加速版本（feature flag 控制）

### s12 — 工具注册表

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/tools.ts` |
| 核心函数 | `assembleToolPool()` |
| 工具排序 | 稳定排序（prompt cache 依赖前缀一致） |

**架构要点：**
- `tools.ts` 是所有工具的注册中心
- 工具列表的排序必须稳定——因为 Anthropic prompt cache 基于消息前缀匹配
- 部分工具是条件加载的（feature flag / USER_TYPE / 平台检测）
- `isDeferredTool` 标记延迟加载的工具（Skill 系统需要）

---

## Phase 3: 终端 UI（s13-s16）

### s13 — Ink 入门

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/ink/` + `src/ink.ts` |
| 框架 | React + Ink（Claude Code 内部 fork 了 Ink） |
| 渲染 | `src/ink.ts` 封装了 Ink render + ThemeProvider |

**架构要点：**
- Claude Code 使用的是 Ink 的内部 fork 版本
- 自定义 reconciler、虚拟列表、搜索高亮等增强
- React Compiler 用于性能优化（decompiled 代码中的 `_c()` 调用）

### s14 — 消息列表

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/components/Messages.tsx` + `MessageRow.tsx` |
| 渲染 | Markdown → 终端 ANSI 着色 |
| 类型 | 不同消息类型有不同视觉呈现 |

### s15 — 输入框

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/components/PromptInput/` |
| 功能 | 多行编辑 + 输入历史 + 快捷键 |

### s16 — REPL 主屏

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/screens/REPL.tsx`（5000+ 行） |
| 职责 | 组装消息列表 + 输入框 + 工具权限 + 状态栏 |

---

## Phase 4: Prompt 工程（s17-s19）

### s17 — 基础 System Prompt

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/constants/prompts.ts` |
| 组装 | 分层结构化片段（不是一段话） |

### s18 — CLAUDE.md 项目规则

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/context.ts` + `src/utils/claudemd.ts` |
| 加载 | 三级：`~/.claude/CLAUDE.md` → 项目根 → 子目录 |

### s19 — Prompt Cache

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/services/api/claude.ts`（cache_control 逻辑） |
| 核心 | `DYNAMIC_BOUNDARY` 标记 + 工具列表稳定排序 |

---

## Phase 5: 流式与性能（s20-s23）

### s20-s21 — Streaming

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/services/api/claude.ts`（streaming 部分） |
| 事件处理 | `BetaRawMessageStreamEvent` 流式事件解析 |
| 回退 | 流式失败 → 非流式 fallback |
| watchdog | 超时检测，长时间无新 token 则重试 |

### s22 — 工具并行执行

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/services/tools/StreamingToolExecutor.ts` |
| 安全标记 | `isConcurrencySafe` / `isReadOnly` |
| 并行策略 | 只读工具并行，写入工具串行 |

### s23 — 启动性能

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/entrypoints/cli.tsx`（快速路径） + `src/main.tsx`（并行 prefetch） |
| 关键优化 | 懒加载 + --version 快速路径 + 并行预加载配置/权限/MCP |

---

## Phase 6: 上下文管理（s24-s26）

### s24 — 自动压缩

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/services/compact/autoCompact.ts` + `compact.ts` |
| 触发 | `shouldAutoCompact()` — token 数超过阈值 |
| 方式 | 用模型自己做摘要压缩 |

### s25 — 多层压缩

| 维度 | Claude Code 对应 |
|------|-----------------|
| micro | `src/services/compact/microCompact.ts` — 轻量级，不调用 API |
| reactive | `src/query.ts` 内 — prompt-too-long 错误触发 |
| circuit breaker | 连续压缩失败时的熔断机制 |

### s26 — 大输出处理

| 维度 | Claude Code 对应 |
|------|-----------------|
| 源码文件 | `src/utils/toolResultStorage.ts` |
| 策略 | 大输出写入磁盘，messages 中只保留引用 |

---

## Phase 7: Agent 智能（s27-s31）

### s27 — TodoWrite

| 源码文件 | `src/tools/TodoWriteTool/` |

### s28-s29 — Subagent

| 源码文件 | `src/tools/AgentTool/runAgent.ts` + `agentToolUtils.ts` + `src/utils/forkedAgent.ts` |
| 隔离 | 独立 agentId + 文件快照 + abort 控制 |
| 工具限制 | `filterToolsForAgent()` — 子 Agent 工具集 ⊂ 父 Agent |
| 深度 | `AsyncLocalStorage` 追踪递归深度 |

### s30 — Skill 系统

| 源码文件 | `src/tools/SkillTool/` + `src/tools/ToolSearchTool/` |
| 加载方式 | 通过 tool_result 注入知识（不是 system prompt） |

### s31 — Task System

| 源码文件 | `src/tasks/` + `src/tools/TaskCreateTool/` 等 |
| 数据结构 | 依赖图 + 状态机 + 磁盘持久化 |

---

## Phase 8: 安全与权限（s32-s34）

### s32 — 权限规则引擎

| 源码文件 | `src/utils/permissions/permissions.ts`（6300+ 行） |
| 模式 | plan / auto / manual（`permissionMode`） |
| 规则 | allow / deny / ask 三级 |

### s33 — 权限 UI

| 源码文件 | `src/components/permissions/` |
| 预览 | BashPermissionRequest 显示即将执行的命令预览 |

### s34 — 子 Agent 权限

| 源码文件 | `src/tools/AgentTool/runAgent.ts`（权限 scope 段落） |
| 原则 | 子 Agent 只能更严，不能更松 |

---

## Phase 9: 扩展生态（s35-s38）

### s35 — MCP 客户端

| 源码文件 | `src/services/mcp/client.ts` + `MCPConnectionManager.tsx` |
| 规模 | 24 个文件，12000+ 行 |

### s36 — MCP 服务端

| 源码文件 | `src/services/mcp/config.ts` + `src/main.tsx`（mcp 子命令） |

### s37 — 会话持久化

| 源码文件 | `src/utils/sessionStorage.ts` + `src/screens/ResumeConversation.tsx` |
| 格式 | JSONL 转录文件 |

### s38 — Plugin System

| 源码文件 | `src/services/plugins/` + `src/utils/plugins/` |

---

## Phase 10: 多 Agent（s39-s43）

### s39 — Agent 定义

| 源码文件 | `src/tools/AgentTool/loadAgentsDir.ts` |

### s40 — Coordinator

| 源码文件 | `src/coordinator/coordinatorMode.ts` |

### s41 — Team + Mailbox

| 源码文件 | `src/tools/TeamCreateTool/` + `src/utils/swarm/teammateMailbox.ts` |
| 通信 | JSONL 文件邮箱（文件系统是 IPC） |

### s42 — Team Protocols

| 源码文件 | `src/utils/swarm/permissionSync.ts` |

### s43 — Worktree 隔离

| 源码文件 | `src/utils/worktree.ts` + `src/tools/EnterWorktreeTool/` |

---

## Phase 11: 产品化（s44-s48）

### s44 — 递进式错误恢复

| 源码文件 | `src/query.ts`（错误恢复 pipeline） |
| 策略栈 | prompt-too-long → compact → fallback model → recovery message → circuit breaker |

### s45 — Feature Flags

| 源码文件 | `src/entrypoints/cli.tsx`（`feature()` polyfill） |
| 生产版 | `bun:bundle` 编译期 DCE + GrowthBook 运行时门控 |
| 30 个 Flag | 见 `claude-code-best/README.md` 的 Feature Flags 章节 |

### s46 — 打包与分发

| 源码文件 | `build.mjs` + `package.json`（bin/exports） |
| 产物 | `dist/cli.js`（~25MB 单文件） |

### s47 — Native 能力

| 源码文件 | `packages/`（workspace 子包） |
| 4 种策略 | npm 原生包 / spawn 系统命令 / FFI / 纯 TS 重写 |
| 示例 | `color-diff-napi`（完整 TS 实现）vs `audio-capture-napi`（stub） |

### s48 — 遥测与诊断

| 源码文件 | `src/utils/startupProfiler.ts` + `src/screens/Doctor.tsx` |
| 遥测 | OpenTelemetry（生产版）/ 空实现（CCB） |
