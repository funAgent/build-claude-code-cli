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

export const PHASES: PhaseDefinition[] = [
  {
    id: "preparation",
    label: "预备知识",
    color: "#6B7280",
    sessions: ["s00", "s01", "s02"],
    description: "前端开发者需要补的非前端知识",
  },
  {
    id: "minimal-agent",
    label: "最小 Agent",
    color: "#3B82F6",
    sessions: ["s03", "s04", "s05", "s06", "s07"],
    description: "从零到能对话、能调用工具的最小 Agent",
  },
  {
    id: "tool-system",
    label: "工具体系",
    color: "#10B981",
    sessions: ["s08", "s09", "s10", "s11", "s12"],
    description: "从 1 个工具到完整的工具系统",
  },
  {
    id: "terminal-ui",
    label: "终端 UI",
    color: "#8B5CF6",
    sessions: ["s13", "s14", "s15", "s16"],
    description: "从 console.log 到专业的终端交互界面",
  },
  {
    id: "prompt-engineering",
    label: "Prompt 工程",
    color: "#EC4899",
    sessions: ["s17", "s18", "s19"],
    description: "从硬编码到分层可缓存的 Prompt 架构",
  },
  {
    id: "streaming-perf",
    label: "流式与性能",
    color: "#F59E0B",
    sessions: ["s20", "s21", "s22", "s23"],
    description: "从等待到实时的性能提升",
  },
  {
    id: "context-mgmt",
    label: "上下文管理",
    color: "#14B8A6",
    sessions: ["s24", "s25", "s26"],
    description: "让 Agent 能进行无限长度的对话",
  },
  {
    id: "agent-intelligence",
    label: "Agent 智能",
    color: "#6366F1",
    sessions: ["s27", "s28", "s29", "s30", "s31"],
    description: "从单任务到会规划、会委派、会加载知识",
  },
  {
    id: "security",
    label: "安全与权限",
    color: "#EF4444",
    sessions: ["s32", "s33", "s34"],
    description: "从裸奔到企业级安全",
  },
  {
    id: "ecosystem",
    label: "扩展生态",
    color: "#06B6D4",
    sessions: ["s35", "s36", "s37", "s38"],
    description: "从封闭到可扩展的产品生态",
  },
  {
    id: "multi-agent",
    label: "多 Agent",
    color: "#F97316",
    sessions: ["s39", "s40", "s41", "s42", "s43"],
    description: "从单兵到多 Agent 团队协作",
  },
  {
    id: "production",
    label: "产品化",
    color: "#84CC16",
    sessions: ["s44", "s45", "s46", "s47", "s48"],
    description: "从能跑到能发布、能更新、能监控",
  },
];

export const VERSION_ORDER = [
  "s00", "s01", "s02", "s03", "s04", "s05", "s06", "s07",
  "s08", "s09", "s10", "s11", "s12",
  "s13", "s14", "s15", "s16",
  "s17", "s18", "s19",
  "s20", "s21", "s22", "s23",
  "s24", "s25", "s26",
  "s27", "s28", "s29", "s30", "s31",
  "s32", "s33", "s34",
  "s35", "s36", "s37", "s38",
  "s39", "s40", "s41", "s42", "s43",
  "s44", "s45", "s46", "s47", "s48",
] as const;

export const LEARNING_PATH = VERSION_ORDER;

export type VersionId = (typeof LEARNING_PATH)[number];

export const VERSION_META: Record<string, VersionMeta> = {
  s00: { title: "AI API 入门", subtitle: "理解 Messages API", motto: "Before building an agent, understand how to talk to the model", coreAddition: "Anthropic Messages API 调用", keyInsight: "AI 对话的本质是一个 messages 数组的往返", phase: "preparation", prevVersion: null, toolCount: 0, loc: 50, claudeCodeRef: "services/api/claude.ts" },
  s01: { title: "CLI 脚手架", subtitle: "npm init + Commander", motto: "Every product starts with npm init and a bin field", coreAddition: "Commander.js CLI 解析 + bin 入口", keyInsight: "一个 CLI 产品的起点是 package.json 的 bin 字段", phase: "preparation", prevVersion: "s00", toolCount: 0, loc: 100, claudeCodeRef: "entrypoints/cli.tsx + main.tsx" },
  s02: { title: "子进程与安全执行", subtitle: "child_process 基础", motto: "An agent needs hands — child_process is the first pair", coreAddition: "安全的 shell 命令执行模块", keyInsight: "Agent 的「手」是子进程；安全检查必须在执行前", phase: "preparation", prevVersion: "s01", toolCount: 0, loc: 80, claudeCodeRef: "tools/BashTool/BashTool.tsx" },

  s03: { title: "Agent Loop", subtitle: "核心循环", motto: "One loop is all you need", coreAddition: "while(stop_reason === 'tool_use') 循环 + BashTool", keyInsight: "整个 AI Agent 的秘密就是一个 while 循环", phase: "minimal-agent", prevVersion: "s02", toolCount: 1, loc: 100, claudeCodeRef: "query.ts (queryLoop)" },
  s04: { title: "消息管理", subtitle: "messages 数组的结构设计", motto: "The messages array IS the agent's memory", coreAddition: "消息类型系统 + 格式化 + 截断", keyInsight: "messages 数组不是日志，是 Agent 的工作记忆", phase: "minimal-agent", prevVersion: "s03", toolCount: 1, loc: 150, claudeCodeRef: "types/message.ts + utils/messages.ts" },
  s05: { title: "错误处理", subtitle: "让 Agent 不崩溃", motto: "An agent that crashes on the first error is not an agent", coreAddition: "API 重试 + 工具错误作为 tool_result 返回", keyInsight: "不要 catch 然后 crash，而是把错误告诉模型让它修正", phase: "minimal-agent", prevVersion: "s04", toolCount: 1, loc: 200, claudeCodeRef: "query.ts (withheld errors + recovery)" },
  s06: { title: "配置管理", subtitle: ".env + 全局/项目配置", motto: "Never hardcode what might change", coreAddition: "多层配置 + /config 命令", keyInsight: "配置优先级：CLI 参数 > 环境变量 > 项目配置 > 全局配置 > 默认值", phase: "minimal-agent", prevVersion: "s05", toolCount: 1, loc: 200, claudeCodeRef: "utils/config.ts" },
  s07: { title: "成本追踪", subtitle: "Token 计数与计费", motto: "If you can't measure it, you can't manage it", coreAddition: "实时成本显示 + /cost 命令", keyInsight: "用户需要知道每次对话花了多少钱", phase: "minimal-agent", prevVersion: "s06", toolCount: 1, loc: 150, claudeCodeRef: "cost-tracker.ts" },

  s08: { title: "Tool 抽象", subtitle: "定义工具的标准接口", motto: "A good abstraction makes adding tools trivial", coreAddition: "Tool 类型 + ToolUseContext + buildTool 工厂", keyInsight: "工具是 name + schema + call 三元组，循环不需要知道工具细节", phase: "tool-system", prevVersion: "s07", toolCount: 1, loc: 200, claudeCodeRef: "Tool.ts" },
  s09: { title: "文件工具", subtitle: "FileRead + FileWrite", motto: "Reading and writing files is the agent's most basic skill", coreAddition: "文件读写 + 路径安全 + 行号标注", keyInsight: "路径安全检查必须在工具层，不能依赖 prompt 约束", phase: "tool-system", prevVersion: "s08", toolCount: 3, loc: 300, claudeCodeRef: "tools/FileReadTool/ + tools/FileWriteTool/" },
  s10: { title: "编辑工具", subtitle: "FileEdit 精确替换", motto: "Replace, don't rewrite — precision editing saves tokens", coreAddition: "old_string → new_string 替换 + 唯一性检查 + diff 预览", keyInsight: "精确替换比整文件覆写节省 90% 的 token", phase: "tool-system", prevVersion: "s09", toolCount: 4, loc: 250, claudeCodeRef: "tools/FileEditTool/FileEditTool.ts" },
  s11: { title: "搜索工具", subtitle: "Glob + Grep", motto: "Before editing, the agent must find", coreAddition: "文件模式搜索 + 内容搜索（ripgrep）", keyInsight: "搜索是 Agent 最高频的工具——先找到再修改", phase: "tool-system", prevVersion: "s10", toolCount: 6, loc: 300, claudeCodeRef: "tools/GlobTool/ + tools/GrepTool/" },
  s12: { title: "工具注册表", subtitle: "统一管理所有工具", motto: "One registry to rule them all", coreAddition: "tools.ts 注册表 + 工具排序 + 简单模式", keyInsight: "工具列表的排序必须稳定——因为 prompt cache 依赖前缀一致", phase: "tool-system", prevVersion: "s11", toolCount: 9, loc: 400, claudeCodeRef: "tools.ts (assembleToolPool)" },

  s13: { title: "Ink 入门", subtitle: "React 渲染终端", motto: "React is not just for browsers — it renders terminals too", coreAddition: "Ink 框架 + Box/Text 组件 + render 替换 console.log", keyInsight: "终端 UI 和 Web UI 的心智模型是一样的——组件 + 状态 + 渲染", phase: "terminal-ui", prevVersion: "s12", toolCount: 9, loc: 300, claudeCodeRef: "ink/ 目录" },
  s14: { title: "消息列表", subtitle: "渲染对话历史", motto: "Show the conversation as it happens", coreAddition: "MessageList 组件 + Markdown 渲染 + 代码块高亮", keyInsight: "不同消息类型需要不同的视觉呈现", phase: "terminal-ui", prevVersion: "s13", toolCount: 9, loc: 400, claudeCodeRef: "components/ 消息相关组件" },
  s15: { title: "输入框", subtitle: "多行编辑 + 历史记录", motto: "The input box is where the user lives", coreAddition: "PromptInput + 输入历史 + Spinner + 状态栏", keyInsight: "输入体验决定产品体验——多行、历史、快捷键缺一不可", phase: "terminal-ui", prevVersion: "s14", toolCount: 9, loc: 400, claudeCodeRef: "components/PromptInput/" },
  s16: { title: "REPL 主屏", subtitle: "组装完整 TUI", motto: "A great REPL is greater than the sum of its parts", coreAddition: "REPL 屏幕 + 模式切换 + 欢迎信息 + 窗口自适应", keyInsight: "REPL 是 CLI 产品的「主界面」——它把所有组件组装成体验", phase: "terminal-ui", prevVersion: "s15", toolCount: 9, loc: 500, claudeCodeRef: "screens/REPL.tsx" },

  s17: { title: "基础 System Prompt", subtitle: "告诉 Agent 它是谁", motto: "The prompt is the agent's worldview", coreAddition: "工具使用指南自动生成 + 环境信息注入", keyInsight: "系统提示不是一段话，是一组分层组装的结构化片段", phase: "prompt-engineering", prevVersion: "s16", toolCount: 9, loc: 300, claudeCodeRef: "constants/prompts.ts" },
  s18: { title: "CLAUDE.md 项目规则", subtitle: "让 Agent 了解项目", motto: "Every project has unwritten rules — write them for the agent", coreAddition: "三级规则文件加载 + /init 命令", keyInsight: "项目规则是 Agent 最重要的上下文来源——比代码本身更重要", phase: "prompt-engineering", prevVersion: "s17", toolCount: 9, loc: 300, claudeCodeRef: "context.ts (getUserContext)" },
  s19: { title: "Prompt Cache", subtitle: "让重复 Prompt 不重复计费", motto: "Pay once, reuse forever — cache your prompt prefix", coreAddition: "DYNAMIC_BOUNDARY 标记 + cache_control + 工具列表稳定排序", keyInsight: "prompt cache 命中率直接决定成本——工具列表排序不能随便改", phase: "prompt-engineering", prevVersion: "s18", toolCount: 9, loc: 200, claudeCodeRef: "utils/api.ts (splitSysPromptPrefix)" },

  s20: { title: "基础 Streaming", subtitle: "逐 token 显示", motto: "Users should see tokens as they arrive", coreAddition: "Streaming API + 逐字渲染 + 使用量流式累加", keyInsight: "流式不是可选优化，是 Agent 产品的基本体验要求", phase: "streaming-perf", prevVersion: "s19", toolCount: 9, loc: 400, claudeCodeRef: "services/api/claude.ts (streaming)" },
  s21: { title: "Streaming 进阶", subtitle: "thinking + 工具流式", motto: "Stream everything — text, thinking, and tool calls", coreAddition: "thinking block 处理 + tool_use 流式解析 + watchdog + 非流式回退", keyInsight: "工具调用也是流式的——JSON 是一段一段到达的，需要边收边拼", phase: "streaming-perf", prevVersion: "s20", toolCount: 9, loc: 300, claudeCodeRef: "services/api/claude.ts (watchdog, fallback)" },
  s22: { title: "工具并行执行", subtitle: "安全工具并行，危险工具串行", motto: "Safe tools run in parallel; dangerous tools run alone", coreAddition: "StreamingToolExecutor + isConcurrencySafe + sibling abort", keyInsight: "读操作可以并行，写操作必须串行——用标记而不是猜测", phase: "streaming-perf", prevVersion: "s21", toolCount: 9, loc: 400, claudeCodeRef: "services/tools/StreamingToolExecutor.ts" },
  s23: { title: "启动性能优化", subtitle: "从 3 秒到 300 毫秒", motto: "The fastest code is code that doesn't run", coreAddition: "懒加载 + 并行 prefetch + 快速路径 + profileCheckpoint", keyInsight: "CLI 启动速度是用户留存的第一个门槛", phase: "streaming-perf", prevVersion: "s22", toolCount: 9, loc: 300, claudeCodeRef: "entrypoints/cli.tsx (fast paths) + main.tsx (parallel prefetch)" },

  s24: { title: "自动压缩", subtitle: "阈值触发上下文压缩", motto: "Context will fill up; you need a way to make room", coreAddition: "shouldAutoCompact + 压缩 API 调用 + compact boundary + 消息重建", keyInsight: "压缩不是删除历史，是用摘要替换细节——保留记忆的骨架", phase: "context-mgmt", prevVersion: "s23", toolCount: 9, loc: 400, claudeCodeRef: "services/compact/autoCompact.ts + compact.ts" },
  s25: { title: "多层压缩策略", subtitle: "micro + reactive + circuit breaker", motto: "One compression strategy is not enough", coreAddition: "microCompact + reactive compact + context collapse + circuit breaker", keyInsight: "压缩策略必须递进：先轻量尝试，再深度压缩，最后紧急兜底", phase: "context-mgmt", prevVersion: "s24", toolCount: 9, loc: 300, claudeCodeRef: "services/compact/microCompact.ts + query.ts (reactive)" },
  s26: { title: "大输出处理", subtitle: "工具结果的预算与替换", motto: "Not all tool results need to stay in memory", coreAddition: "applyToolResultBudget + Content Replacement + 磁盘持久化", keyInsight: "工具结果可能比对话本身还大——必须有预算控制和磁盘替换机制", phase: "context-mgmt", prevVersion: "s25", toolCount: 9, loc: 300, claudeCodeRef: "utils/toolResultStorage.ts" },

  s27: { title: "TodoWrite", subtitle: "让 Agent 先规划再执行", motto: "An agent without a plan drifts", coreAddition: "TodoWriteTool + 任务状态机 + UI 渲染", keyInsight: "规划不是额外步骤，是核心能力——有规划的 Agent 完成率翻倍", phase: "agent-intelligence", prevVersion: "s26", toolCount: 10, loc: 300, claudeCodeRef: "tools/TodoWriteTool/" },
  s28: { title: "Subagent 基础", subtitle: "上下文隔离", motto: "Break big tasks down; each subtask gets a clean context", coreAddition: "AgentTool + createSubagentContext", keyInsight: "子 Agent 共享文件系统但不共享对话历史——隔离的是记忆，不是环境", phase: "agent-intelligence", prevVersion: "s27", toolCount: 11, loc: 400, claudeCodeRef: "tools/AgentTool/runAgent.ts + utils/forkedAgent.ts" },
  s29: { title: "Subagent 进阶", subtitle: "工具限制与深度控制", motto: "A subagent should do less, not more", coreAddition: "filterToolsForAgent + 递归深度 + AsyncLocalStorage + 生命周期清理", keyInsight: "子 Agent 的能力必须小于父 Agent——权力越大，风险越大", phase: "agent-intelligence", prevVersion: "s28", toolCount: 11, loc: 300, claudeCodeRef: "tools/AgentTool/agentToolUtils.ts" },
  s30: { title: "Skill 系统", subtitle: "按需加载知识", motto: "Load knowledge when you need it, not upfront", coreAddition: "SkillTool + SKILL.md + ToolSearchTool + isDeferredTool", keyInsight: "知识注入通过 tool_result 而非 system prompt——按需加载，不浪费 token", phase: "agent-intelligence", prevVersion: "s29", toolCount: 13, loc: 400, claudeCodeRef: "tools/SkillTool/ + tools/ToolSearchTool/" },
  s31: { title: "Task System", subtitle: "文件化任务图", motto: "Break big goals into small tasks, order them, persist to disk", coreAddition: "TaskCreate/Get/Update/List + 依赖图 + 后台 Agent + task-notification", keyInsight: "任务不只是 todo list——它是多 Agent 协作的共享数据结构", phase: "agent-intelligence", prevVersion: "s30", toolCount: 17, loc: 500, claudeCodeRef: "tasks/ + tools/TaskCreateTool/" },

  s32: { title: "权限规则引擎", subtitle: "allow / deny / ask", motto: "Security is not one check; it's layered defense", coreAddition: "规则数据结构 + 匹配算法 + permissionMode + hasPermissionsToUseTool", keyInsight: "权限不靠 prompt 约束——靠代码层面的物理隔离和规则引擎", phase: "security", prevVersion: "s31", toolCount: 17, loc: 500, claudeCodeRef: "utils/permissions/permissions.ts" },
  s33: { title: "权限 UI", subtitle: "交互式审批对话框", motto: "Ask before you act — and show what you're about to do", coreAddition: "PermissionPrompt + BashPermissionRequest + FileEditPermissionRequest + 记住选择", keyInsight: "权限提示不是打断，是信任建设——用户看到预览后更愿意授权", phase: "security", prevVersion: "s32", toolCount: 17, loc: 400, claudeCodeRef: "components/permissions/" },
  s34: { title: "子 Agent 权限", subtitle: "继承与隔离", motto: "Children can be stricter, never looser", coreAddition: "权限继承规则 + bubble 模式 + shouldAvoidPermissionPrompts + session 隔离", keyInsight: "安全下限不可被子级放宽——只能更严，不能更松", phase: "security", prevVersion: "s33", toolCount: 17, loc: 300, claudeCodeRef: "tools/AgentTool/runAgent.ts (permission scoping)" },

  s35: { title: "MCP 客户端", subtitle: "连接外部工具", motto: "Don't build every tool; let the ecosystem build them", coreAddition: "MCP 客户端 + 传输层 + 工具发现 + MCPTool 封装", keyInsight: "MCP 让你的 Agent 工具集从十几个扩展到无限——但你只为用到的付费", phase: "ecosystem", prevVersion: "s34", toolCount: 18, loc: 500, claudeCodeRef: "services/mcp/client.ts + MCPConnectionManager.tsx" },
  s36: { title: "MCP 服务端 + 配置", subtitle: "让自己也能被调用", motto: "The best tools are both consumers and providers", coreAddition: "mcp serve 子命令 + mcp add/remove/list + Resource 工具 + OAuth", keyInsight: "你的 CLI 既是 MCP 客户端也是 MCP 服务端——这是生态的双向性", phase: "ecosystem", prevVersion: "s35", toolCount: 20, loc: 500, claudeCodeRef: "services/mcp/config.ts + main.tsx (mcp command)" },
  s37: { title: "会话持久化", subtitle: "断点续做", motto: "A professional tool never loses your work", coreAddition: "JSONL 转录 + session ID + --resume + ResumeConversation 屏幕", keyInsight: "会话不是用完即弃——真正的工具让你随时回来继续", phase: "ecosystem", prevVersion: "s36", toolCount: 20, loc: 500, claudeCodeRef: "utils/sessionStorage.ts + screens/ResumeConversation.tsx" },
  s38: { title: "Plugin System", subtitle: "第三方扩展", motto: "The best products are platforms, not just tools", coreAddition: "插件加载 + marketplace + 验证 + 安全边界", keyInsight: "插件系统把你的产品从工具变成平台——生态是护城河", phase: "ecosystem", prevVersion: "s37", toolCount: 20, loc: 400, claudeCodeRef: "services/plugins/ + utils/plugins/" },

  s39: { title: "Agent 定义", subtitle: "声明式配置", motto: "Agents should be configured, not hardcoded", coreAddition: "AgentDefinition 类型 + 多来源合并 + claude agents 命令", keyInsight: "好的 Agent 系统让用户通过 JSON 定义新 Agent——零代码扩展", phase: "multi-agent", prevVersion: "s38", toolCount: 20, loc: 400, claudeCodeRef: "tools/AgentTool/loadAgentsDir.ts" },
  s40: { title: "Coordinator", subtitle: "Leader-Worker 编排", motto: "One coordinator, many workers — divide and conquer", coreAddition: "Coordinator 系统提示 + Worker 工具池约束 + 内部工具隔离", keyInsight: "协调器的 prompt 动态描述 Worker 能用什么工具——是文档，不是代码", phase: "multi-agent", prevVersion: "s39", toolCount: 20, loc: 400, claudeCodeRef: "coordinator/coordinatorMode.ts" },
  s41: { title: "Team + Mailbox", subtitle: "文件邮箱通信", motto: "When the task is too big for one, delegate to teammates", coreAddition: "TeamCreate/Delete + SendMessage + JSONL 文件邮箱 + 共享任务列表", keyInsight: "文件系统是最可靠的进程间通信——不需要消息队列", phase: "multi-agent", prevVersion: "s40", toolCount: 23, loc: 500, claudeCodeRef: "tools/TeamCreateTool/ + utils/swarm/teammateMailbox.ts" },
  s42: { title: "Team Protocols", subtitle: "协商协议", motto: "Teammates need shared communication rules", coreAddition: "权限同步 + 计划审批 + 关闭协议 + FSM 状态机", keyInsight: "多 Agent 系统的稳定性取决于协议设计，不是 Agent 智能", phase: "multi-agent", prevVersion: "s41", toolCount: 23, loc: 400, claudeCodeRef: "utils/swarm/permissionSync.ts" },
  s43: { title: "Worktree 隔离", subtitle: "每个 Agent 独立目录", motto: "Each works in its own directory, no interference", coreAddition: "createAgentWorktree + cwd 隔离 + EnterWorktree/ExitWorktree + 清理策略", keyInsight: "Git Worktree 给每个 Agent 一个平行世界——文件不冲突，提交不混乱", phase: "multi-agent", prevVersion: "s42", toolCount: 25, loc: 400, claudeCodeRef: "utils/worktree.ts + tools/EnterWorktreeTool/" },

  s44: { title: "递进式错误恢复", subtitle: "从报错到自愈", motto: "Ship fast, fail gracefully, recover automatically", coreAddition: "prompt-too-long → compact → fallback model → recovery message → circuit breaker", keyInsight: "错误恢复不是 retry 3 次——是一套分级递进的策略栈", phase: "production", prevVersion: "s43", toolCount: 25, loc: 400, claudeCodeRef: "query.ts (error recovery pipeline)" },
  s45: { title: "Feature Flags", subtitle: "安全发布新功能", motto: "Every feature is an experiment until proven stable", coreAddition: "编译期 DCE + 运行时门控 + USER_TYPE 分流 + 灰度发布", keyInsight: "Feature flag 不是开关——是让你在不回滚代码的情况下关闭出问题的功能", phase: "production", prevVersion: "s44", toolCount: 25, loc: 300, claudeCodeRef: "bun-shim.ts + services/analytics/growthbook.ts" },
  s46: { title: "打包与分发", subtitle: "esbuild → npm publish", motto: "If users can't install it in one command, they won't use it", coreAddition: "esbuild 单文件打包 + bin 配置 + npm publish + 自动更新", keyInsight: "打包不只是编译——是把你的产品变成任何人一条命令就能用的东西", phase: "production", prevVersion: "s45", toolCount: 25, loc: 300, claudeCodeRef: "build.mjs + package.json (bin, exports)" },
  s47: { title: "Native 能力", subtitle: "4 种 OS 集成策略", motto: "The terminal is your canvas; the OS is your palette", coreAddition: "npm 原生包 + spawn 系统命令 + FFI + 纯 TS 重写 + Stub 模式", keyInsight: "与操作系统集成不一定需要写 C++——4 种策略各有适用场景", phase: "production", prevVersion: "s46", toolCount: 25, loc: 300, claudeCodeRef: "packages/ (workspace 子包)" },
  s48: { title: "遥测与诊断", subtitle: "知道产品怎么被使用", motto: "A product without metrics is flying blind", coreAddition: "OpenTelemetry + profileCheckpoint + logEvent + Doctor 命令 + 最终架构回顾", keyInsight: "遥测是产品闭环的最后一环——没有数据就没有迭代方向", phase: "production", prevVersion: "s47", toolCount: 25, loc: 300, claudeCodeRef: "utils/startupProfiler.ts + screens/Doctor.tsx" },
};

export const PHASE_BG_CLASS: Record<PhaseId, string> = {
  preparation: "bg-gray-500",
  "minimal-agent": "bg-blue-500",
  "tool-system": "bg-emerald-500",
  "terminal-ui": "bg-purple-500",
  "prompt-engineering": "bg-pink-500",
  "streaming-perf": "bg-amber-500",
  "context-mgmt": "bg-teal-500",
  "agent-intelligence": "bg-indigo-500",
  security: "bg-red-500",
  ecosystem: "bg-cyan-500",
  "multi-agent": "bg-orange-500",
  production: "bg-lime-500",
};

export function getPhaseForSession(sessionId: string): PhaseDefinition | undefined {
  return PHASES.find((p) => p.sessions.includes(sessionId));
}
