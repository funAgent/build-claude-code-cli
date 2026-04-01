# Build Claude Code — 项目规划文档

> 从零构建企业级 AI Agent CLI，逐课拆解 Claude Code 源码架构

---

## 一、项目定位

### 1.1 是什么

一个 **49 课的渐进式教学项目**，教前端开发者从 `npm init` 开始，逐课构建出一个完整的、可安装分发的 AI Agent CLI 产品——架构严格参考 Claude Code。

### 1.2 不是什么

- 不是 Claude Code 的复刻（不复制任何一行源码）
- 不是 Agent 原理科普（不是概念课，是工程实战课）
- 不是框架/SDK（产出物是一个完整的 CLI 产品）

### 1.3 与 learn-claude-code 的关系

| 维度 | learn-claude-code | Build Claude Code |
|------|-------------------|-------------------|
| 目标 | 理解 Agent 原理 | **从零造一个 CLI 产品** |
| 语言 | Python | **TypeScript** |
| 每课产出 | 一个 .py 脚本（100-300 行） | **一个可运行的 CLI 项目快照** |
| 课程量 | 12 课 | **49 课** |
| 终点 | 理解 while + tool_use | **一个可 npm install -g 的企业级 CLI** |
| 覆盖面 | Agent 机制 | **Agent + TUI + 权限 + MCP + 打包 + 遥测** |
| 展示网站 | 参考其框架 | **在其基础上增加 5 项优化** |
| 受众 | 想理解原理的人 | **想造产品的前端工程师** |

### 1.4 源码参考策略

```
不复制任何现有源码，而是：
1. 理解 Claude Code 的架构设计和设计决策
2. 用自己的代码从零实现同样的架构
3. 在教学文档中以"架构对照"方式引用源码设计模式（教育用途）
4. 本项目所有代码采用 MIT 协议
```

参考来源（仅用于架构学习，不引入代码）：
- `claude-code`：原始泄露源码，理解"为什么这么设计"
- `open-agent-sdk`：可运行版本，验证架构理解是否正确
- `learn-claude-code`：教学方法论和网站框架参考

---

## 二、目标受众

**前端开发者 + AI Agent 小白**

前置假设：
- ✅ 熟悉 TypeScript / JavaScript
- ✅ 熟悉 React（函数组件、Hooks）
- ✅ 熟悉 npm / Node.js 基础
- ✅ 会用终端 / shell
- ❌ 不了解 AI Agent 是什么
- ❌ 没用过 Anthropic API
- ❌ 不了解 MCP 协议
- ❌ 不了解终端 TUI 框架（Ink）

---

## 三、技术栈

### 3.1 教学项目（agents/）

| 层面 | 选择 | 说明 |
|------|------|------|
| 语言 | TypeScript 5.x | 严格模式 |
| 运行时 | Node.js ≥ 18 | 不依赖 Bun，受众更广 |
| CLI 框架 | Commander.js | 与 Claude Code 一致 |
| TUI 框架 | React 19 + Ink 5 | 与 Claude Code 一致 |
| AI SDK | @anthropic-ai/sdk | 官方 SDK |
| Schema | Zod | 工具输入验证 |
| 打包 | esbuild | 单文件 CLI 产出 |
| MCP | @modelcontextprotocol/sdk | 官方 SDK |

### 3.2 教学网站（web/）

| 层面 | 选择 | 说明 |
|------|------|------|
| 框架 | Next.js 16（App Router） | 与 learn-claude-code 一致 |
| 样式 | Tailwind CSS v4 | 与 learn-claude-code 一致 |
| 动画 | framer-motion | 与 learn-claude-code 一致 |
| Markdown | unified + remark + rehype | 与 learn-claude-code 一致 |
| 部署 | Vercel（静态导出） | 与 learn-claude-code 一致 |
| 国际化 | 自定义 i18n（JSON + Context） | 先做中文，后加英文 |

---

## 四、目录结构

```
build-claude-code/
│
├── PLAN.md                          # 本文档
├── README.md                        # 项目介绍
├── LICENSE                          # MIT
│
├── agents/                          # TypeScript 教学实现（每课一个目录）
│   ├── s00-api-basics/              # 每个目录是一个完整可运行项目
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── .env.example
│   ├── s01-cli-scaffold/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── cli.ts               # 入口
│   │       └── main.ts              # 主逻辑
│   ├── s02-child-process/
│   ├── s03-agent-loop/
│   ├── ...
│   └── s48-telemetry/
│
├── docs/                            # 教学文档（Markdown）
│   ├── zh/                          # 中文（主语言）
│   │   ├── s00-api-basics.md
│   │   ├── s01-cli-scaffold.md
│   │   ├── ...
│   │   └── s48-telemetry.md
│   └── en/                          # 英文（后续添加）
│       └── ...
│
├── web/                             # Next.js 教学网站
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx             # 根路由重定向
│   │   │   ├── globals.css
│   │   │   └── [locale]/
│   │   │       ├── page.tsx         # 首页
│   │   │       ├── layout.tsx       # 语言布局
│   │   │       └── (learn)/
│   │   │           ├── layout.tsx   # 带侧边栏布局
│   │   │           ├── timeline/
│   │   │           ├── compare/
│   │   │           ├── layers/
│   │   │           ├── architecture/  # 新增：架构全景图
│   │   │           └── [version]/
│   │   │               ├── page.tsx
│   │   │               ├── client.tsx
│   │   │               └── diff/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── header.tsx
│   │   │   │   └── sidebar.tsx      # 优化：分组折叠
│   │   │   ├── ui/
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   └── progress.tsx     # 新增：进度条
│   │   │   ├── visualizations/
│   │   │   │   ├── index.tsx
│   │   │   │   ├── shared/
│   │   │   │   │   └── step-controls.tsx
│   │   │   │   ├── s00-api-basics.tsx
│   │   │   │   ├── ...
│   │   │   │   └── s48-telemetry.tsx
│   │   │   ├── simulator/
│   │   │   │   ├── agent-loop-simulator.tsx
│   │   │   │   ├── simulator-controls.tsx
│   │   │   │   └── simulator-message.tsx
│   │   │   ├── terminal/            # 新增：终端预览
│   │   │   │   ├── terminal-preview.tsx
│   │   │   │   └── terminal-frame.tsx
│   │   │   ├── reference/           # 新增：对照源码
│   │   │   │   ├── source-reference.tsx
│   │   │   │   └── dual-code-view.tsx
│   │   │   ├── architecture/
│   │   │   │   ├── arch-diagram.tsx
│   │   │   │   ├── arch-map.tsx     # 新增：可交互架构全景图
│   │   │   │   ├── execution-flow.tsx
│   │   │   │   ├── design-decisions.tsx
│   │   │   │   └── message-flow.tsx
│   │   │   ├── docs/
│   │   │   │   └── doc-renderer.tsx
│   │   │   ├── code/
│   │   │   │   └── source-viewer.tsx
│   │   │   ├── diff/
│   │   │   │   ├── code-diff.tsx
│   │   │   │   └── whats-new.tsx
│   │   │   ├── timeline/
│   │   │   │   └── timeline.tsx
│   │   │   └── progress/            # 新增：学习进度
│   │   │       └── progress-tracker.tsx
│   │   ├── hooks/
│   │   │   ├── useSteppedVisualization.ts
│   │   │   ├── useSimulator.ts
│   │   │   ├── useDarkMode.ts
│   │   │   └── useProgress.ts       # 新增：进度追踪
│   │   ├── lib/
│   │   │   ├── constants.ts         # 课程元数据
│   │   │   ├── i18n.tsx
│   │   │   ├── i18n-server.ts
│   │   │   └── utils.ts
│   │   ├── i18n/
│   │   │   └── messages/
│   │   │       ├── zh.json
│   │   │       └── en.json
│   │   ├── types/
│   │   │   └── agent-data.ts
│   │   └── data/
│   │       ├── generated/           # 由 extract 脚本生成
│   │       │   ├── versions.json
│   │       │   └── docs.json
│   │       ├── scenarios/           # 模拟器场景 JSON
│   │       │   ├── s00.json
│   │       │   ├── ...
│   │       │   └── s48.json
│   │       ├── annotations/         # 设计决策注释
│   │       │   ├── s00.json
│   │       │   ├── ...
│   │       │   └── s48.json
│   │       ├── terminal-recordings/ # 新增：终端预览数据
│   │       │   ├── s00.json
│   │       │   ├── ...
│   │       │   └── s48.json
│   │       ├── reference-mapping/   # 新增：源码映射
│   │       │   └── mapping.json
│   │       └── execution-flows.ts
│   ├── scripts/
│   │   └── extract-content.ts
│   └── public/
│
├── reference/                       # 架构参考笔记（不含源码）
│   └── architecture-notes.md        # Claude Code 架构要点速查
│
└── .github/
    └── workflows/
        └── ci.yml
```

---

## 五、课程完整大纲（49 课）

### 5.1 Phase 分组定义

```typescript
export const PHASES = [
  {
    id: "preparation",
    label: "预备知识",
    color: "#6B7280",    // gray
    sessions: ["s00", "s01", "s02"],
    description: "前端开发者需要补的非前端知识"
  },
  {
    id: "minimal-agent",
    label: "最小 Agent",
    color: "#3B82F6",    // blue
    sessions: ["s03", "s04", "s05", "s06", "s07"],
    description: "从零到能对话、能调用工具的最小 Agent"
  },
  {
    id: "tool-system",
    label: "工具体系",
    color: "#10B981",    // green
    sessions: ["s08", "s09", "s10", "s11", "s12"],
    description: "从 1 个工具到完整的工具系统"
  },
  {
    id: "terminal-ui",
    label: "终端 UI",
    color: "#8B5CF6",    // purple
    sessions: ["s13", "s14", "s15", "s16"],
    description: "从 console.log 到专业的终端交互界面"
  },
  {
    id: "prompt-engineering",
    label: "Prompt 工程",
    color: "#EC4899",    // pink
    sessions: ["s17", "s18", "s19"],
    description: "从硬编码到分层可缓存的 Prompt 架构"
  },
  {
    id: "streaming-perf",
    label: "流式与性能",
    color: "#F59E0B",    // amber
    sessions: ["s20", "s21", "s22", "s23"],
    description: "从等待到实时的性能提升"
  },
  {
    id: "context-mgmt",
    label: "上下文管理",
    color: "#14B8A6",    // teal
    sessions: ["s24", "s25", "s26"],
    description: "让 Agent 能进行无限长度的对话"
  },
  {
    id: "agent-intelligence",
    label: "Agent 智能",
    color: "#6366F1",    // indigo
    sessions: ["s27", "s28", "s29", "s30", "s31"],
    description: "从单任务到会规划、会委派、会加载知识"
  },
  {
    id: "security",
    label: "安全与权限",
    color: "#EF4444",    // red
    sessions: ["s32", "s33", "s34"],
    description: "从裸奔到企业级安全"
  },
  {
    id: "ecosystem",
    label: "扩展生态",
    color: "#06B6D4",    // cyan
    sessions: ["s35", "s36", "s37", "s38"],
    description: "从封闭到可扩展的产品生态"
  },
  {
    id: "multi-agent",
    label: "多 Agent",
    color: "#F97316",    // orange
    sessions: ["s39", "s40", "s41", "s42", "s43"],
    description: "从单兵到多 Agent 团队协作"
  },
  {
    id: "production",
    label: "产品化",
    color: "#84CC16",    // lime
    sessions: ["s44", "s45", "s46", "s47", "s48"],
    description: "从能跑到能发布、能更新、能监控"
  },
] as const;
```

### 5.2 全部 49 课元数据

```typescript
export const VERSION_META = {

  // ═══════════════════════════════════════════
  // Phase 0: 预备知识（3 课）
  // ═══════════════════════════════════════════

  s00: {
    title: "AI API 入门",
    subtitle: "理解 Messages API",
    motto: "Before building an agent, understand how to talk to the model",
    coreAddition: "Anthropic Messages API 调用",
    keyInsight: "AI 对话的本质是一个 messages 数组的往返",
    phase: "preparation",
    prevVersion: null,
    toolCount: 0,
    loc: 50,
    claudeCodeRef: "services/api/claude.ts"
  },
  s01: {
    title: "CLI 脚手架",
    subtitle: "npm init + Commander",
    motto: "Every product starts with npm init and a bin field",
    coreAddition: "Commander.js CLI 解析 + bin 入口",
    keyInsight: "一个 CLI 产品的起点是 package.json 的 bin 字段",
    phase: "preparation",
    prevVersion: "s00",
    toolCount: 0,
    loc: 100,
    claudeCodeRef: "entrypoints/cli.tsx + main.tsx"
  },
  s02: {
    title: "子进程与安全执行",
    subtitle: "child_process 基础",
    motto: "An agent needs hands — child_process is the first pair",
    coreAddition: "安全的 shell 命令执行模块",
    keyInsight: "Agent 的「手」是子进程；安全检查必须在执行前，不是执行后",
    phase: "preparation",
    prevVersion: "s01",
    toolCount: 0,
    loc: 80,
    claudeCodeRef: "tools/BashTool/BashTool.tsx"
  },

  // ═══════════════════════════════════════════
  // Phase 1: 最小 Agent（5 课）
  // ═══════════════════════════════════════════

  s03: {
    title: "Agent Loop",
    subtitle: "核心循环",
    motto: "One loop is all you need",
    coreAddition: "while(stop_reason === 'tool_use') 循环 + BashTool",
    keyInsight: "整个 AI Agent 的秘密就是一个 while 循环",
    phase: "minimal-agent",
    prevVersion: "s02",
    toolCount: 1,
    loc: 100,
    claudeCodeRef: "query.ts (queryLoop)"
  },
  s04: {
    title: "消息管理",
    subtitle: "messages 数组的结构设计",
    motto: "The messages array IS the agent's memory",
    coreAddition: "消息类型系统 + 格式化 + 截断",
    keyInsight: "messages 数组不是日志，是 Agent 的工作记忆",
    phase: "minimal-agent",
    prevVersion: "s03",
    toolCount: 1,
    loc: 150,
    claudeCodeRef: "types/message.ts + utils/messages.ts"
  },
  s05: {
    title: "错误处理",
    subtitle: "让 Agent 不崩溃",
    motto: "An agent that crashes on the first error is not an agent",
    coreAddition: "API 重试 + 工具错误作为 tool_result 返回",
    keyInsight: "不要 catch 然后 crash，而是把错误告诉模型让它修正",
    phase: "minimal-agent",
    prevVersion: "s04",
    toolCount: 1,
    loc: 200,
    claudeCodeRef: "query.ts (withheld errors + recovery)"
  },
  s06: {
    title: "配置管理",
    subtitle: ".env + 全局/项目配置",
    motto: "Never hardcode what might change",
    coreAddition: "多层配置 + /config 命令",
    keyInsight: "配置优先级：CLI 参数 > 环境变量 > 项目配置 > 全局配置 > 默认值",
    phase: "minimal-agent",
    prevVersion: "s05",
    toolCount: 1,
    loc: 200,
    claudeCodeRef: "utils/config.ts"
  },
  s07: {
    title: "成本追踪",
    subtitle: "Token 计数与计费",
    motto: "If you can't measure it, you can't manage it",
    coreAddition: "实时成本显示 + /cost 命令",
    keyInsight: "用户需要知道每次对话花了多少钱",
    phase: "minimal-agent",
    prevVersion: "s06",
    toolCount: 1,
    loc: 150,
    claudeCodeRef: "cost-tracker.ts"
  },

  // ═══════════════════════════════════════════
  // Phase 2: 工具体系（5 课）
  // ═══════════════════════════════════════════

  s08: {
    title: "Tool 抽象",
    subtitle: "定义工具的标准接口",
    motto: "A good abstraction makes adding tools trivial",
    coreAddition: "Tool 类型 + ToolUseContext + buildTool 工厂",
    keyInsight: "工具是 name + schema + call 三元组，循环不需要知道工具细节",
    phase: "tool-system",
    prevVersion: "s07",
    toolCount: 1,
    loc: 200,
    claudeCodeRef: "Tool.ts"
  },
  s09: {
    title: "文件工具",
    subtitle: "FileRead + FileWrite",
    motto: "Reading and writing files is the agent's most basic skill",
    coreAddition: "文件读写 + 路径安全 + 行号标注",
    keyInsight: "路径安全检查必须在工具层，不能依赖 prompt 约束",
    phase: "tool-system",
    prevVersion: "s08",
    toolCount: 3,
    loc: 300,
    claudeCodeRef: "tools/FileReadTool/ + tools/FileWriteTool/"
  },
  s10: {
    title: "编辑工具",
    subtitle: "FileEdit 精确替换",
    motto: "Replace, don't rewrite — precision editing saves tokens",
    coreAddition: "old_string → new_string 替换 + 唯一性检查 + diff 预览",
    keyInsight: "精确替换比整文件覆写节省 90% 的 token",
    phase: "tool-system",
    prevVersion: "s09",
    toolCount: 4,
    loc: 250,
    claudeCodeRef: "tools/FileEditTool/FileEditTool.ts"
  },
  s11: {
    title: "搜索工具",
    subtitle: "Glob + Grep",
    motto: "Before editing, the agent must find",
    coreAddition: "文件模式搜索 + 内容搜索（ripgrep）",
    keyInsight: "搜索是 Agent 最高频的工具——先找到再修改",
    phase: "tool-system",
    prevVersion: "s10",
    toolCount: 6,
    loc: 300,
    claudeCodeRef: "tools/GlobTool/ + tools/GrepTool/"
  },
  s12: {
    title: "工具注册表",
    subtitle: "统一管理所有工具",
    motto: "One registry to rule them all",
    coreAddition: "tools.ts 注册表 + 工具排序 + 简单模式 + 新增 WebFetch/WebSearch/NotebookEdit",
    keyInsight: "工具列表的排序必须稳定——因为 prompt cache 依赖前缀一致",
    phase: "tool-system",
    prevVersion: "s11",
    toolCount: 9,
    loc: 400,
    claudeCodeRef: "tools.ts (assembleToolPool)"
  },

  // ═══════════════════════════════════════════
  // Phase 3: 终端 UI（4 课）
  // ═══════════════════════════════════════════

  s13: {
    title: "Ink 入门",
    subtitle: "React 渲染终端",
    motto: "React is not just for browsers — it renders terminals too",
    coreAddition: "Ink 框架 + Box/Text 组件 + render 替换 console.log",
    keyInsight: "终端 UI 和 Web UI 的心智模型是一样的——组件 + 状态 + 渲染",
    phase: "terminal-ui",
    prevVersion: "s12",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "ink/ 目录"
  },
  s14: {
    title: "消息列表",
    subtitle: "渲染对话历史",
    motto: "Show the conversation as it happens",
    coreAddition: "MessageList 组件 + Markdown 渲染 + 代码块高亮",
    keyInsight: "不同消息类型需要不同的视觉呈现",
    phase: "terminal-ui",
    prevVersion: "s13",
    toolCount: 9,
    loc: 400,
    claudeCodeRef: "components/ 消息相关组件"
  },
  s15: {
    title: "输入框",
    subtitle: "多行编辑 + 历史记录",
    motto: "The input box is where the user lives",
    coreAddition: "PromptInput + 输入历史 + Spinner + 状态栏",
    keyInsight: "输入体验决定产品体验——多行、历史、快捷键缺一不可",
    phase: "terminal-ui",
    prevVersion: "s14",
    toolCount: 9,
    loc: 400,
    claudeCodeRef: "components/PromptInput/"
  },
  s16: {
    title: "REPL 主屏",
    subtitle: "组装完整 TUI",
    motto: "A great REPL is greater than the sum of its parts",
    coreAddition: "REPL 屏幕 + 模式切换 + 欢迎信息 + 窗口自适应",
    keyInsight: "REPL 是 CLI 产品的「主界面」——它把所有组件组装成体验",
    phase: "terminal-ui",
    prevVersion: "s15",
    toolCount: 9,
    loc: 500,
    claudeCodeRef: "screens/REPL.tsx"
  },

  // ═══════════════════════════════════════════
  // Phase 4: Prompt 工程（3 课）
  // ═══════════════════════════════════════════

  s17: {
    title: "基础 System Prompt",
    subtitle: "告诉 Agent 它是谁",
    motto: "The prompt is the agent's worldview",
    coreAddition: "工具使用指南自动生成 + 环境信息注入",
    keyInsight: "系统提示不是一段话，是一组分层组装的结构化片段",
    phase: "prompt-engineering",
    prevVersion: "s16",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "constants/prompts.ts"
  },
  s18: {
    title: "CLAUDE.md 项目规则",
    subtitle: "让 Agent 了解项目",
    motto: "Every project has unwritten rules — write them for the agent",
    coreAddition: "三级规则文件加载 + /init 命令",
    keyInsight: "项目规则是 Agent 最重要的上下文来源——比代码本身更重要",
    phase: "prompt-engineering",
    prevVersion: "s17",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "context.ts (getUserContext)"
  },
  s19: {
    title: "Prompt Cache",
    subtitle: "让重复 Prompt 不重复计费",
    motto: "Pay once, reuse forever — cache your prompt prefix",
    coreAddition: "DYNAMIC_BOUNDARY 标记 + cache_control + 工具列表稳定排序",
    keyInsight: "prompt cache 命中率直接决定成本——工具列表排序不能随便改",
    phase: "prompt-engineering",
    prevVersion: "s18",
    toolCount: 9,
    loc: 200,
    claudeCodeRef: "utils/api.ts (splitSysPromptPrefix)"
  },

  // ═══════════════════════════════════════════
  // Phase 5: 流式与性能（4 课）
  // ═══════════════════════════════════════════

  s20: {
    title: "基础 Streaming",
    subtitle: "逐 token 显示",
    motto: "Users should see tokens as they arrive",
    coreAddition: "Streaming API + 逐字渲染 + 使用量流式累加",
    keyInsight: "流式不是可选优化，是 Agent 产品的基本体验要求",
    phase: "streaming-perf",
    prevVersion: "s19",
    toolCount: 9,
    loc: 400,
    claudeCodeRef: "services/api/claude.ts (streaming)"
  },
  s21: {
    title: "Streaming 进阶",
    subtitle: "thinking + 工具流式",
    motto: "Stream everything — text, thinking, and tool calls",
    coreAddition: "thinking block 处理 + tool_use 流式解析 + watchdog + 非流式回退",
    keyInsight: "工具调用也是流式的——JSON 是一段一段到达的，需要边收边拼",
    phase: "streaming-perf",
    prevVersion: "s20",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "services/api/claude.ts (watchdog, fallback)"
  },
  s22: {
    title: "工具并行执行",
    subtitle: "安全工具并行，危险工具串行",
    motto: "Safe tools run in parallel; dangerous tools run alone",
    coreAddition: "StreamingToolExecutor + isConcurrencySafe + sibling abort",
    keyInsight: "读操作可以并行，写操作必须串行——用标记而不是猜测",
    phase: "streaming-perf",
    prevVersion: "s21",
    toolCount: 9,
    loc: 400,
    claudeCodeRef: "services/tools/StreamingToolExecutor.ts"
  },
  s23: {
    title: "启动性能优化",
    subtitle: "从 3 秒到 300 毫秒",
    motto: "The fastest code is code that doesn't run",
    coreAddition: "懒加载 + 并行 prefetch + 快速路径 + profileCheckpoint",
    keyInsight: "CLI 启动速度是用户留存的第一个门槛",
    phase: "streaming-perf",
    prevVersion: "s22",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "entrypoints/cli.tsx (fast paths) + main.tsx (parallel prefetch)"
  },

  // ═══════════════════════════════════════════
  // Phase 6: 上下文管理（3 课）
  // ═══════════════════════════════════════════

  s24: {
    title: "自动压缩",
    subtitle: "阈值触发上下文压缩",
    motto: "Context will fill up; you need a way to make room",
    coreAddition: "shouldAutoCompact + 压缩 API 调用 + compact boundary + 消息重建",
    keyInsight: "压缩不是删除历史，是用摘要替换细节——保留记忆的骨架",
    phase: "context-mgmt",
    prevVersion: "s23",
    toolCount: 9,
    loc: 400,
    claudeCodeRef: "services/compact/autoCompact.ts + compact.ts"
  },
  s25: {
    title: "多层压缩策略",
    subtitle: "micro + reactive + circuit breaker",
    motto: "One compression strategy is not enough",
    coreAddition: "microCompact + reactive compact + context collapse + circuit breaker",
    keyInsight: "压缩策略必须递进：先轻量尝试，再深度压缩，最后紧急兜底",
    phase: "context-mgmt",
    prevVersion: "s24",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "services/compact/microCompact.ts + query.ts (reactive)"
  },
  s26: {
    title: "大输出处理",
    subtitle: "工具结果的预算与替换",
    motto: "Not all tool results need to stay in memory",
    coreAddition: "applyToolResultBudget + Content Replacement + 磁盘持久化",
    keyInsight: "工具结果可能比对话本身还大——必须有预算控制和磁盘替换机制",
    phase: "context-mgmt",
    prevVersion: "s25",
    toolCount: 9,
    loc: 300,
    claudeCodeRef: "utils/toolResultStorage.ts"
  },

  // ═══════════════════════════════════════════
  // Phase 7: Agent 智能（5 课）
  // ═══════════════════════════════════════════

  s27: {
    title: "TodoWrite",
    subtitle: "让 Agent 先规划再执行",
    motto: "An agent without a plan drifts",
    coreAddition: "TodoWriteTool + 任务状态机 + UI 渲染",
    keyInsight: "规划不是额外步骤，是核心能力——有规划的 Agent 完成率翻倍",
    phase: "agent-intelligence",
    prevVersion: "s26",
    toolCount: 10,
    loc: 300,
    claudeCodeRef: "tools/TodoWriteTool/"
  },
  s28: {
    title: "Subagent 基础",
    subtitle: "上下文隔离",
    motto: "Break big tasks down; each subtask gets a clean context",
    coreAddition: "AgentTool + createSubagentContext（独立 agentId + 文件快照 + abort）",
    keyInsight: "子 Agent 共享文件系统但不共享对话历史——隔离的是记忆，不是环境",
    phase: "agent-intelligence",
    prevVersion: "s27",
    toolCount: 11,
    loc: 400,
    claudeCodeRef: "tools/AgentTool/runAgent.ts + utils/forkedAgent.ts"
  },
  s29: {
    title: "Subagent 进阶",
    subtitle: "工具限制与深度控制",
    motto: "A subagent should do less, not more",
    coreAddition: "filterToolsForAgent + 递归深度 + AsyncLocalStorage + 生命周期清理",
    keyInsight: "子 Agent 的能力必须小于父 Agent——权力越大，风险越大",
    phase: "agent-intelligence",
    prevVersion: "s28",
    toolCount: 11,
    loc: 300,
    claudeCodeRef: "tools/AgentTool/agentToolUtils.ts"
  },
  s30: {
    title: "Skill 系统",
    subtitle: "按需加载知识",
    motto: "Load knowledge when you need it, not upfront",
    coreAddition: "SkillTool + SKILL.md + ToolSearchTool + isDeferredTool",
    keyInsight: "知识注入通过 tool_result 而非 system prompt——按需加载，不浪费 token",
    phase: "agent-intelligence",
    prevVersion: "s29",
    toolCount: 13,
    loc: 400,
    claudeCodeRef: "tools/SkillTool/ + tools/ToolSearchTool/"
  },
  s31: {
    title: "Task System",
    subtitle: "文件化任务图",
    motto: "Break big goals into small tasks, order them, persist to disk",
    coreAddition: "TaskCreate/Get/Update/List + 依赖图 + 后台 Agent + task-notification",
    keyInsight: "任务不只是 todo list——它是多 Agent 协作的共享数据结构",
    phase: "agent-intelligence",
    prevVersion: "s30",
    toolCount: 17,
    loc: 500,
    claudeCodeRef: "tasks/ + tools/TaskCreateTool/"
  },

  // ═══════════════════════════════════════════
  // Phase 8: 安全与权限（3 课）
  // ═══════════════════════════════════════════

  s32: {
    title: "权限规则引擎",
    subtitle: "allow / deny / ask",
    motto: "Security is not one check; it's layered defense",
    coreAddition: "规则数据结构 + 匹配算法 + permissionMode + hasPermissionsToUseTool",
    keyInsight: "权限不靠 prompt 约束——靠代码层面的物理隔离和规则引擎",
    phase: "security",
    prevVersion: "s31",
    toolCount: 17,
    loc: 500,
    claudeCodeRef: "utils/permissions/permissions.ts"
  },
  s33: {
    title: "权限 UI",
    subtitle: "交互式审批对话框",
    motto: "Ask before you act — and show what you're about to do",
    coreAddition: "PermissionPrompt + BashPermissionRequest + FileEditPermissionRequest + 记住选择",
    keyInsight: "权限提示不是打断，是信任建设——用户看到预览后更愿意授权",
    phase: "security",
    prevVersion: "s32",
    toolCount: 17,
    loc: 400,
    claudeCodeRef: "components/permissions/"
  },
  s34: {
    title: "子 Agent 权限",
    subtitle: "继承与隔离",
    motto: "Children can be stricter, never looser",
    coreAddition: "权限继承规则 + bubble 模式 + shouldAvoidPermissionPrompts + session 隔离",
    keyInsight: "安全下限不可被子级放宽——只能更严，不能更松",
    phase: "security",
    prevVersion: "s33",
    toolCount: 17,
    loc: 300,
    claudeCodeRef: "tools/AgentTool/runAgent.ts (permission scoping)"
  },

  // ═══════════════════════════════════════════
  // Phase 9: 扩展生态（4 课）
  // ═══════════════════════════════════════════

  s35: {
    title: "MCP 客户端",
    subtitle: "连接外部工具",
    motto: "Don't build every tool; let the ecosystem build them",
    coreAddition: "MCP 客户端 + 传输层 + 工具发现 + MCPTool 封装",
    keyInsight: "MCP 让你的 Agent 工具集从十几个扩展到无限——但你只为用到的付费",
    phase: "ecosystem",
    prevVersion: "s34",
    toolCount: 18,
    loc: 500,
    claudeCodeRef: "services/mcp/client.ts + MCPConnectionManager.tsx"
  },
  s36: {
    title: "MCP 服务端 + 配置",
    subtitle: "让自己也能被调用",
    motto: "The best tools are both consumers and providers",
    coreAddition: "mcp serve 子命令 + mcp add/remove/list + Resource 工具 + OAuth",
    keyInsight: "你的 CLI 既是 MCP 客户端也是 MCP 服务端——这是生态的双向性",
    phase: "ecosystem",
    prevVersion: "s35",
    toolCount: 20,
    loc: 500,
    claudeCodeRef: "services/mcp/config.ts + main.tsx (mcp command)"
  },
  s37: {
    title: "会话持久化",
    subtitle: "断点续做",
    motto: "A professional tool never loses your work",
    coreAddition: "JSONL 转录 + session ID + --resume + ResumeConversation 屏幕",
    keyInsight: "会话不是用完即弃——真正的工具让你随时回来继续",
    phase: "ecosystem",
    prevVersion: "s36",
    toolCount: 20,
    loc: 500,
    claudeCodeRef: "utils/sessionStorage.ts + screens/ResumeConversation.tsx"
  },
  s38: {
    title: "Plugin System",
    subtitle: "第三方扩展",
    motto: "The best products are platforms, not just tools",
    coreAddition: "插件加载 + marketplace + 验证 + 安全边界",
    keyInsight: "插件系统把你的产品从工具变成平台——生态是护城河",
    phase: "ecosystem",
    prevVersion: "s37",
    toolCount: 20,
    loc: 400,
    claudeCodeRef: "services/plugins/ + utils/plugins/"
  },

  // ═══════════════════════════════════════════
  // Phase 10: 多 Agent（5 课）
  // ═══════════════════════════════════════════

  s39: {
    title: "Agent 定义",
    subtitle: "声明式配置",
    motto: "Agents should be configured, not hardcoded",
    coreAddition: "AgentDefinition 类型 + 多来源合并 + claude agents 命令",
    keyInsight: "好的 Agent 系统让用户通过 JSON 定义新 Agent——零代码扩展",
    phase: "multi-agent",
    prevVersion: "s38",
    toolCount: 20,
    loc: 400,
    claudeCodeRef: "tools/AgentTool/loadAgentsDir.ts"
  },
  s40: {
    title: "Coordinator",
    subtitle: "Leader-Worker 编排",
    motto: "One coordinator, many workers — divide and conquer",
    coreAddition: "Coordinator 系统提示 + Worker 工具池约束 + 内部工具隔离",
    keyInsight: "协调器的 prompt 动态描述 Worker 能用什么工具——是文档，不是代码",
    phase: "multi-agent",
    prevVersion: "s39",
    toolCount: 20,
    loc: 400,
    claudeCodeRef: "coordinator/coordinatorMode.ts"
  },
  s41: {
    title: "Team + Mailbox",
    subtitle: "文件邮箱通信",
    motto: "When the task is too big for one, delegate to teammates",
    coreAddition: "TeamCreate/Delete + SendMessage + JSONL 文件邮箱 + 共享任务列表",
    keyInsight: "文件系统是最可靠的进程间通信——不需要消息队列",
    phase: "multi-agent",
    prevVersion: "s40",
    toolCount: 23,
    loc: 500,
    claudeCodeRef: "tools/TeamCreateTool/ + utils/swarm/teammateMailbox.ts"
  },
  s42: {
    title: "Team Protocols",
    subtitle: "协商协议",
    motto: "Teammates need shared communication rules",
    coreAddition: "权限同步 + 计划审批 + 关闭协议 + FSM 状态机",
    keyInsight: "多 Agent 系统的稳定性取决于协议设计，不是 Agent 智能",
    phase: "multi-agent",
    prevVersion: "s41",
    toolCount: 23,
    loc: 400,
    claudeCodeRef: "utils/swarm/permissionSync.ts"
  },
  s43: {
    title: "Worktree 隔离",
    subtitle: "每个 Agent 独立目录",
    motto: "Each works in its own directory, no interference",
    coreAddition: "createAgentWorktree + cwd 隔离 + EnterWorktree/ExitWorktree + 清理策略",
    keyInsight: "Git Worktree 给每个 Agent 一个平行世界——文件不冲突，提交不混乱",
    phase: "multi-agent",
    prevVersion: "s42",
    toolCount: 25,
    loc: 400,
    claudeCodeRef: "utils/worktree.ts + tools/EnterWorktreeTool/"
  },

  // ═══════════════════════════════════════════
  // Phase 11: 产品化（5 课）
  // ═══════════════════════════════════════════

  s44: {
    title: "递进式错误恢复",
    subtitle: "从报错到自愈",
    motto: "Ship fast, fail gracefully, recover automatically",
    coreAddition: "prompt-too-long → compact → fallback model → recovery message → circuit breaker",
    keyInsight: "错误恢复不是 retry 3 次——是一套分级递进的策略栈",
    phase: "production",
    prevVersion: "s43",
    toolCount: 25,
    loc: 400,
    claudeCodeRef: "query.ts (error recovery pipeline)"
  },
  s45: {
    title: "Feature Flags",
    subtitle: "安全发布新功能",
    motto: "Every feature is an experiment until proven stable",
    coreAddition: "编译期 DCE + 运行时门控 + USER_TYPE 分流 + 灰度发布",
    keyInsight: "Feature flag 不是开关——是让你在不回滚代码的情况下关闭出问题的功能",
    phase: "production",
    prevVersion: "s44",
    toolCount: 25,
    loc: 300,
    claudeCodeRef: "bun-shim.ts + services/analytics/growthbook.ts"
  },
  s46: {
    title: "打包与分发",
    subtitle: "esbuild → npm publish",
    motto: "If users can't install it in one command, they won't use it",
    coreAddition: "esbuild 单文件打包 + bin 配置 + npm publish + 自动更新",
    keyInsight: "打包不只是编译——是把你的产品变成任何人一条命令就能用的东西",
    phase: "production",
    prevVersion: "s45",
    toolCount: 25,
    loc: 300,
    claudeCodeRef: "build.mjs + package.json (bin, exports)"
  },
  s47: {
    title: "Native 能力",
    subtitle: "4 种 OS 集成策略",
    motto: "The terminal is your canvas; the OS is your palette",
    coreAddition: "npm 原生包 + spawn 系统命令 + FFI + 纯 TS 重写 + Stub 模式",
    keyInsight: "与操作系统集成不一定需要写 C++——4 种策略各有适用场景",
    phase: "production",
    prevVersion: "s46",
    toolCount: 25,
    loc: 300,
    claudeCodeRef: "packages/ (workspace 子包)"
  },
  s48: {
    title: "遥测与诊断",
    subtitle: "知道产品怎么被使用",
    motto: "A product without metrics is flying blind",
    coreAddition: "OpenTelemetry + profileCheckpoint + logEvent + Doctor 命令 + 最终架构回顾",
    keyInsight: "遥测是产品闭环的最后一环——没有数据就没有迭代方向",
    phase: "production",
    prevVersion: "s47",
    toolCount: 25,
    loc: 300,
    claudeCodeRef: "utils/startupProfiler.ts + screens/Doctor.tsx"
  },

};
```

---

## 六、网站页面设计

### 6.1 页面路由

```
/                              → 重定向到 /zh/
/zh/                           → 首页（Hero + 架构图 + 学习路径 + Phase 概述）
/zh/architecture/              → 架构全景图（可交互）          [新增]
/zh/timeline/                  → 时间线（49 课垂直时间轴 + LOC 增长）
/zh/compare/                   → 对比（任意两课）
/zh/layers/                    → Phase 层级分组视图
/zh/s00/                       → 课程页（5 个 Tab）
/zh/s00/diff/                  → 与上一课的代码 diff
...
/zh/s48/
/zh/s48/diff/
```

### 6.2 课程页 5 个 Tab

| Tab | 名称 | 内容 | 来源 |
|-----|------|------|------|
| 1 | **Learn** | 教学文档（Markdown 渲染） | `docs/zh/sXX.md` |
| 2 | **Simulate** | Agent 执行模拟器 | `data/scenarios/sXX.json` |
| 3 | **Code** | 本课完整 TypeScript 源码 | `agents/sXX/` 目录 |
| 4 | **Reference** | 对照 Claude Code 架构 | `data/reference-mapping/mapping.json` [新增] |
| 5 | **Deep Dive** | 架构图 + 执行流 + 设计决策 | `data/annotations/sXX.json` |

### 6.3 相对 learn-claude-code 的 5 项优化

#### 优化 1：架构全景图（新增页面 + 首页组件）

```
位置：/zh/architecture/ + 首页 Section
功能：
├── 可交互的系统架构 SVG 图
├── 鼠标悬停模块 → 高亮 + 显示关联课程
├── 点击模块 → 跳转到对应课程
├── 11 个 Phase 折叠/展开
└── 模块间依赖连线
技术：SVG + framer-motion
```

#### 优化 2：终端预览组件（课程页）

```
位置：课程页底部（Tab 区域之下）
功能：
├── 模拟终端窗口（标题栏 + 内容区）
├── JSON 驱动的步骤式回放
├── 命令输入动画 + AI 回复逐字显示
├── 工具调用的彩色输出
├── Play / Pause / 倍速
└── 复制命令按钮
数据源：data/terminal-recordings/sXX.json
```

#### 优化 3：对照源码 Tab（课程页第 4 个 Tab）

```
位置：课程页 Reference Tab
功能：
├── 左侧：本课简化实现（SourceViewer）
├── 右侧：Claude Code 架构对应片段（引用说明，非源码）
├── 注释标注：概念对应关系
├── "生产版多了什么"折叠面板
└── 可切换对比点
数据源：data/reference-mapping/mapping.json
```

#### 优化 4：学习进度追踪

```
位置：侧边栏 + 首页 + 时间线
功能：
├── localStorage 存储课程完成状态
├── 侧边栏：每课旁 ✓ / → / ○ 图标
├── 首页：进度条 + "继续学习 → sXX" CTA
├── 时间线：已完成 vs 未完成视觉区分
└── 课程页底部：标记为已完成按钮
技术：纯客户端 localStorage
```

#### 优化 5：分组折叠侧边栏

```
位置：侧边栏
功能：
├── 按 12 个 Phase 分组
├── 每组可折叠/展开
├── 当前 Phase 自动展开
├── 进度数字 (2/5) 动态显示
├── 颜色编码（每个 Phase 不同颜色）
└── 移动端：抽屉式
```

---

## 七、数据结构定义

### 7.1 constants.ts 类型定义

```typescript
export type PhaseId =
  | "preparation"
  | "minimal-agent"
  | "tool-system"
  | "terminal-ui"
  | "prompt-engineering"
  | "streaming-perf"
  | "context-mgmt"
  | "agent-intelligence"
  | "security"
  | "ecosystem"
  | "multi-agent"
  | "production";

export interface PhaseDefinition {
  id: PhaseId;
  label: string;
  color: string;
  sessions: string[];
  description: string;
}

export interface VersionMeta {
  title: string;
  subtitle: string;
  motto: string;
  coreAddition: string;
  keyInsight: string;
  phase: PhaseId;
  prevVersion: string | null;
  toolCount: number;
  loc: number;
  claudeCodeRef: string;
}
```

### 7.2 模拟器场景格式（scenarios/sXX.json）

```json
{
  "version": "s03",
  "description": "Agent 收到用户请求后，调用 BashTool 执行命令的完整过程",
  "steps": [
    {
      "type": "user_message",
      "content": "帮我看看当前目录有什么文件"
    },
    {
      "type": "assistant_text",
      "content": "我来用 ls 命令查看一下。"
    },
    {
      "type": "tool_call",
      "tool": "bash",
      "input": { "command": "ls -la" },
      "reasoning": "使用 ls -la 查看当前目录的文件列表"
    },
    {
      "type": "tool_result",
      "content": "total 32\ndrwxr-xr-x  5 user  staff  160 Mar 31 10:00 .\n..."
    },
    {
      "type": "assistant_text",
      "content": "当前目录包含以下文件：..."
    },
    {
      "type": "system_event",
      "content": "stop_reason: end_turn — 模型决定不再调用工具，循环结束"
    }
  ]
}
```

### 7.3 终端预览格式（terminal-recordings/sXX.json）

```json
{
  "version": "s03",
  "title": "mycli v0.3.0",
  "steps": [
    { "type": "prompt", "text": "mycli" },
    { "type": "output", "text": "Welcome to MyCLI v0.3.0\n", "color": "cyan" },
    { "type": "prompt", "text": "s03 >> " },
    { "type": "input", "text": "帮我看看这个项目的结构", "typeDelay": 50 },
    { "type": "output", "text": "$ ls -la\n", "color": "yellow" },
    { "type": "output", "text": "total 32\ndrwxr-xr-x  5 user  staff ...\n", "color": "white" },
    { "type": "output", "text": "\n这个项目包含以下结构：...\n", "color": "white", "charDelay": 20 }
  ]
}
```

### 7.4 对照源码映射（reference-mapping/mapping.json）

```json
{
  "s03": {
    "title": "Agent Loop 对照",
    "points": [
      {
        "concept": "核心循环",
        "ourFile": "src/agent.ts",
        "ourLines": "15-35",
        "claudeCodeFile": "query.ts",
        "claudeCodeConcept": "queryLoop 函数",
        "difference": "生产版支持流式工具执行、自动压缩、fallback model 等，我们的简化版只有基础循环",
        "whyProduction": "流式执行让工具在 API 响应还在进行中时就开始运行，用户体验更好；自动压缩解决了长对话 token 溢出的问题"
      },
      {
        "concept": "工具调用",
        "ourFile": "src/tools/bash.ts",
        "ourLines": "1-30",
        "claudeCodeFile": "tools/BashTool/BashTool.tsx",
        "claudeCodeConcept": "BashTool 完整实现",
        "difference": "生产版有沙箱、安全分类器、进度追踪、图片处理等，我们只有基础执行+安全拦截",
        "whyProduction": "沙箱（sandbox）在 macOS 上限制了文件系统访问范围；安全分类器用 AI 判断命令是否安全"
      }
    ]
  }
}
```

---

## 八、每课文档模板

文件路径：`docs/zh/sXX-slug.md`

```markdown
# sXX — [标题]

> **[格言]**

`[ Phase N: Phase名称 ]` · 工具数: N · 代码量: ~N 行

---

## 前置知识

- 需要完成: sYY [上一课标题]

## 你将学到

- 要点 1
- 要点 2
- 要点 3
- 要点 4

## 问题场景

[用具体场景说明为什么现在的版本不够用，1-2 段]

## 设计决策

| 方案 | 优点 | 缺点 |
|------|------|------|
| A: ... | ... | ... |
| B: ... | ... | ... |

**Claude Code 选择了 B，因为...**

## 动手实现

### 步骤 1: [做什么]

```typescript
// 代码
```

### 步骤 2: [做什么]

```typescript
// 代码
```

## 运行验证

```bash
cd agents/sXX-slug
npm install
npm run dev
```

```
mycli
s03 >> 帮我看看当前目录有什么文件
$ ls -la
total 32
...
```

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| [概念1] | `src/agent.ts` | `query.ts` (queryLoop) |
| [概念2] | `src/tools/bash.ts` | `tools/BashTool/BashTool.tsx` |

**生产版多了什么？**

- [差异点 1 + 为什么]
- [差异点 2 + 为什么]

## 深入思考

**Q: [一个工程细节的问题]？**

A: [详细解答]

## 动手练习

[一个扩展任务，比如"给你的 Agent 加一个 WebFetchTool"]

## 下一课预告

下一课 [sXX+1 标题] 将解决 [什么问题]...
```

---

## 九、实施路线图

### 阶段 A：项目脚手架（第 1 周）

```
□ 初始化项目目录结构
□ 创建 README.md
□ 初始化 web/ Next.js 项目（fork learn-claude-code 的网站框架）
□ 配置 Tailwind + framer-motion + 国际化
□ 实现 constants.ts（49 课元数据 + 12 个 Phase）
□ 实现基础布局（Header + 分组折叠 Sidebar）
□ 实现首页骨架
□ 部署到 Vercel
```

### 阶段 B：核心功能页面（第 2-3 周）

```
□ 实现课程页面（5 Tab 布局）
□ 实现 DocRenderer（Markdown 渲染）
□ 实现 SourceViewer（代码查看）
□ 实现 AgentLoopSimulator（模拟器）
□ 实现 Timeline 页面
□ 实现 Compare 页面
□ 实现 Layers 页面
□ 实现 CodeDiff（版本差异对比）
```

### 阶段 C：5 项优化组件（第 3-4 周）

```
□ 实现 ArchitectureMap（可交互架构全景图）
□ 实现 TerminalPreview（终端预览组件）
□ 实现 SourceReference（对照源码 Tab）
□ 实现 ProgressTracker（学习进度追踪）
□ 优化 Sidebar 分组折叠
```

### 阶段 D：Phase 0-1 内容（第 4-6 周）

```
□ 编写 s00-s07 教学代码（agents/s00 ~ s07）
□ 编写 s00-s07 教学文档（docs/zh/）
□ 制作 s00-s07 模拟器场景（data/scenarios/）
□ 制作 s00-s07 可视化组件
□ 制作 s00-s07 终端预览录制
□ 编写 s00-s07 源码映射
```

### 阶段 E：Phase 2-5 内容（第 7-12 周）

```
□ s08-s23 教学代码 + 文档 + 配套数据
□ 持续优化网站交互
```

### 阶段 F：Phase 6-11 内容（第 13-20 周）

```
□ s24-s48 教学代码 + 文档 + 配套数据
□ 英文翻译
□ 最终审校与发布
```

---

## 十、质量标准

### 10.1 每课必须满足

- [ ] 代码可独立运行（`npm install && npm run dev`）
- [ ] 文档包含问题场景 + 设计决策 + 动手实现 + 运行验证
- [ ] 模拟器场景可正常播放
- [ ] 与上一课有明确的 diff（可在 Compare 页面查看）
- [ ] 至少一个"深入思考" Q&A
- [ ] 至少一个"动手练习"
- [ ] 终端预览可正常播放

### 10.2 代码风格

- 使用 Biome 格式化
- 不使用 `any`（教学代码也要严格类型）
- 注释只解释 "为什么"，不解释 "做什么"
- 每个文件不超过 300 行（超过就拆分）

### 10.3 文档风格

- 每课 1500-3000 字（中文）
- 代码块不超过 30 行（超过就拆分讲解）
- 每个概念用具体场景引入，不用抽象定义开头
- 格言用英文（统一风格）

---

*文档版本: v1.0*
*最后更新: 2026-03-31*
