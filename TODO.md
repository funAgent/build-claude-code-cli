# Build Claude Code — TODO LIST

> 每个任务都必须参考 `reference/claude-code-architecture.md` 中对应章节的 Claude Code 源码映射。
>
> Claude Code 源码位于 `/Users/wang/workspace/GitHub/mini-claude-code-cli/claude-code-best/src/`

---

## 状态图例

- `[ ]` 待做
- `[~]` 进行中
- `[x]` 已完成

---

## 阶段 B：核心功能页面

> 网站基础组件和页面完善

### B1. CodeDiff 版本差异对比

- [x] **B1.1** 实现 `web/src/components/diff/code-diff.tsx` — unified diff 渲染
- [x] **B1.2** 实现 `web/src/components/diff/whats-new.tsx` — 新增内容高亮
- [x] **B1.3** 实现 `/[locale]/[version]/diff/page.tsx` — 对比页面路由 + 版本页 "变更" Tab
- [x] **B1.4** 在 extract-content.ts 中增加子目录递归扫描 + 客户端 diff 计算

### B2. 可交互架构全景图（优化 1）

- [x] **B2.1** 实现 `web/src/components/architecture/arch-map.tsx` — SVG 可交互架构图
  - 鼠标悬停模块 → 高亮 + 显示关联课程
  - 点击模块 → 跳转对应课程
  - 12 个 Phase 折叠/展开
- [x] **B2.2** 实现 `/[locale]/architecture/page.tsx` — 架构全景页面
- [x] **B2.3** 在首页添加架构图 Section

---

## 阶段 D：Phase 1 — 最小 Agent（s03-s07）

> **⚠️ 必读**：每课开始前先阅读 `reference/claude-code-architecture.md` Phase 1 章节
>
> Claude Code 源码参考路径：`mini-claude-code-cli/claude-code-best/src/`

### s03 — Agent Loop ⭐ 最关键的一课

> **Claude Code 参考**: `src/query.ts`（~1700 行，核心 while 循环）
>
> 重点研究 `query()` 函数的循环结构：while(true) + stop_reason 判断 + tool_use 处理

- [x] **D-s03.1** 编写 Agent 源码 `agents/s03-agent-loop/`
  - `src/agent.ts` — while(stop_reason === "tool_use") 循环
  - `src/tools/bash.ts` — BashTool（复用 s02 的 execShell）
  - 参考 `query.ts` 的循环结构，但简化为最小版本
- [x] **D-s03.2** 编写教学文档 `docs/zh/s03-agent-loop.md`
  - 按模板：问题场景 → 设计决策 → 动手实现 → 运行验证 → 对照 → 深入思考 → 练习
  - 代码块精简（5-10 行核心），引导至 Code Tab
  - 对照表引导至 Deep Dive Tab
- [x] **D-s03.3** 创建模拟器场景 `web/src/data/scenarios/s03.json`
  - 至少 6 步：user → assistant → tool_call → tool_result → assistant → system_event
  - 体现完整的 Agent 循环（这是第一个真正有循环的场景）
- [x] **D-s03.4** 创建 annotations `web/src/data/annotations/s03.json`
  - mermaid 架构图：展示 while 循环 + tool dispatch
  - 设计决策：while vs 递归、错误在循环内 vs 外
  - reference 对照：query.ts 的循环 vs 我们的简化版
- [x] **D-s03.5** 创建终端录制 `web/src/data/terminal-recordings/s03.json`
  - 演示完整的一轮工具调用循环

### s04 — 消息管理

> **Claude Code 参考**: `src/types/message.ts` + `src/utils/messages.ts`
>
> 重点研究消息类型层级和 ContentBlock 设计

- [x] **D-s04.1** 编写 Agent 源码 `agents/s04-message-management/`
  - `src/types.ts` — Message / ContentBlock 类型定义
  - `src/messages.ts` — 消息格式化、截断
  - 参考 `types/message.ts` 的类型层级
- [x] **D-s04.2** 编写教学文档 `docs/zh/s04-message-management.md`
- [x] **D-s04.3** 创建模拟器场景 `web/src/data/scenarios/s04.json`
- [x] **D-s04.4** 创建 annotations `web/src/data/annotations/s04.json`
- [x] **D-s04.5** 创建终端录制 `web/src/data/terminal-recordings/s04.json`

### s05 — 错误处理

> **Claude Code 参考**: `src/query.ts`（错误恢复段落）
>
> 重点研究：工具错误 → tool_result(is_error:true) → 模型自修正
> API 错误 → 指数退避重试 → 降级到备用模型

- [x] **D-s05.1** 编写 Agent 源码 `agents/s05-error-handling/`
  - `src/retry.ts` — 指数退避重试
  - 工具错误作为 tool_result 返回（不 crash 循环）
- [x] **D-s05.2** 编写教学文档 `docs/zh/s05-error-handling.md`
- [x] **D-s05.3** 创建模拟器场景 `web/src/data/scenarios/s05.json`
- [x] **D-s05.4** 创建 annotations `web/src/data/annotations/s05.json`
- [x] **D-s05.5** 创建终端录制 `web/src/data/terminal-recordings/s05.json`

### s06 — 配置管理

> **Claude Code 参考**: `src/utils/config.ts`
>
> 重点研究：多层配置优先级链

- [x] **D-s06.1** 编写 Agent 源码 `agents/s06-configuration/`
- [x] **D-s06.2** 编写教学文档 `docs/zh/s06-configuration.md`
- [x] **D-s06.3** 创建模拟器场景 `web/src/data/scenarios/s06.json`
- [x] **D-s06.4** 创建 annotations `web/src/data/annotations/s06.json`
- [x] **D-s06.5** 创建终端录制 `web/src/data/terminal-recordings/s06.json`

### s07 — 成本追踪

> **Claude Code 参考**: `src/bootstrap/state.ts`（token 计数器）
>
> 重点研究：usage 字段累加、按模型定价计算

- [x] **D-s07.1** 编写 Agent 源码 `agents/s07-cost-tracking/`
- [x] **D-s07.2** 编写教学文档 `docs/zh/s07-cost-tracking.md`
- [x] **D-s07.3** 创建模拟器场景 `web/src/data/scenarios/s07.json`
- [x] **D-s07.4** 创建 annotations `web/src/data/annotations/s07.json`
- [x] **D-s07.5** 创建终端录制 `web/src/data/terminal-recordings/s07.json`

---

## 阶段 E-1：Phase 2 — 工具体系（s08-s12）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 2 章节
>
> Claude Code 源码参考：`src/Tool.ts` + `src/tools.ts` + `src/tools/*/`

### s08 — Tool 抽象

> **Claude Code 参考**: `src/Tool.ts`
>
> 重点研究：Tool 类型定义（name + schema + call 三元组）、isReadOnly/needsPermissions 标记

- [x] **E-s08.1** 编写 Agent 源码 `agents/s08-tool-abstraction/`
  - `src/tool.ts` — Tool interface + buildTool 工厂
  - 改造 BashTool 为 Tool 接口实现
- [x] **E-s08.2** 编写教学文档 `docs/zh/s08-tool-abstraction.md`
- [x] **E-s08.3** 创建配套数据 (scenarios + annotations + terminal-recordings)

### s09 — 文件工具

> **Claude Code 参考**: `src/tools/FileReadTool/` + `src/tools/FileWriteTool/`
>
> 重点研究：路径安全验证 validateFilePath()、行号标注、diff 生成

- [x] **E-s09.1** 编写 Agent 源码 `agents/s09-file-tools/`
- [x] **E-s09.2** 编写教学文档 `docs/zh/s09-file-tools.md`
- [x] **E-s09.3** 创建配套数据

### s10 — 编辑工具

> **Claude Code 参考**: `src/tools/FileEditTool/FileEditTool.ts`
>
> 重点研究：old_string→new_string 替换、唯一性检查、diff 预览

- [x] **E-s10.1** 编写 Agent 源码 `agents/s10-edit-tool/`
- [x] **E-s10.2** 编写教学文档 `docs/zh/s10-edit-tool.md`
- [x] **E-s10.3** 创建配套数据

### s11 — 搜索工具

> **Claude Code 参考**: `src/tools/GlobTool/` + `src/tools/GrepTool/`
>
> 重点研究：ripgrep 集成、输出截断策略

- [x] **E-s11.1** 编写 Agent 源码 `agents/s11-search-tools/`
- [x] **E-s11.2** 编写教学文档 `docs/zh/s11-search-tools.md`
- [x] **E-s11.3** 创建配套数据

### s12 — 工具注册表

> **Claude Code 参考**: `src/tools.ts`（assembleToolPool）
>
> 重点研究：工具列表稳定排序（prompt cache 依赖）、条件加载

- [x] **E-s12.1** 编写 Agent 源码 `agents/s12-tool-registry/`
- [x] **E-s12.2** 编写教学文档 `docs/zh/s12-tool-registry.md`
- [x] **E-s12.3** 创建配套数据

---

## 阶段 E-2：Phase 3 — 终端 UI（s13-s16）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 3 章节
>
> Claude Code 源码参考：`src/ink/` + `src/screens/REPL.tsx` + `src/components/`

### s13 — Ink 入门

> **Claude Code 参考**: `src/ink/` + `src/ink.ts`
>
> 重点研究：Ink 的 render 封装、Box/Text 基础组件

- [x] **E-s13.1** 编写 Agent 源码 `agents/s13-ink-basics/`
- [x] **E-s13.2** 编写教学文档 `docs/zh/s13-ink-basics.md`
- [x] **E-s13.3** 创建配套数据

### s14 — 消息列表

> **Claude Code 参考**: `src/components/Messages.tsx` + `MessageRow.tsx`

- [x] **E-s14.1** 编写 Agent 源码 `agents/s14-message-list/`
- [x] **E-s14.2** 编写教学文档 `docs/zh/s14-message-list.md`
- [x] **E-s14.3** 创建配套数据

### s15 — 输入框

> **Claude Code 参考**: `src/components/PromptInput/`

- [x] **E-s15.1** 编写 Agent 源码 `agents/s15-input-box/`
- [x] **E-s15.2** 编写教学文档 `docs/zh/s15-input-box.md`
- [x] **E-s15.3** 创建配套数据

### s16 — REPL 主屏

> **Claude Code 参考**: `src/screens/REPL.tsx`（5000+ 行）
>
> 重点研究：消息列表 + 输入框 + 工具权限 + 状态栏的组装方式

- [x] **E-s16.1** 编写 Agent 源码 `agents/s16-repl-screen/`
- [x] **E-s16.2** 编写教学文档 `docs/zh/s16-repl-screen.md`
- [x] **E-s16.3** 创建配套数据

---

## 阶段 E-3：Phase 4 — Prompt 工程（s17-s19）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 4 章节
>
> Claude Code 源码参考：`src/constants/prompts.ts` + `src/context.ts` + `src/utils/claudemd.ts`

### s17 — 基础 System Prompt

> **Claude Code 参考**: `src/constants/prompts.ts`
>
> 重点研究：分层组装的 system prompt 结构

- [x] **E-s17.1** 编写 Agent 源码 `agents/s17-system-prompt/`
- [x] **E-s17.2** 编写教学文档 `docs/zh/s17-system-prompt.md`
- [x] **E-s17.3** 创建配套数据

### s18 — CLAUDE.md 项目规则

> **Claude Code 参考**: `src/context.ts` + `src/utils/claudemd.ts`
>
> 重点研究：三级加载（全局 → 项目根 → 子目录）、getUserContext()

- [x] **E-s18.1** 编写 Agent 源码 `agents/s18-claude-md/`
- [x] **E-s18.2** 编写教学文档 `docs/zh/s18-claude-md.md`
- [x] **E-s18.3** 创建配套数据

### s19 — Prompt Cache

> **Claude Code 参考**: `src/services/api/claude.ts`（cache_control 逻辑）
>
> 重点研究：DYNAMIC_BOUNDARY 标记、cache_control: {type:"ephemeral"} 注入

- [x] **E-s19.1** 编写 Agent 源码 `agents/s19-prompt-cache/`
- [x] **E-s19.2** 编写教学文档 `docs/zh/s19-prompt-cache.md`
- [x] **E-s19.3** 创建配套数据

---

## 阶段 E-4：Phase 5 — 流式与性能（s20-s23）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 5 章节
>
> Claude Code 源码参考：`src/services/api/claude.ts` + `src/services/tools/StreamingToolExecutor.ts`

### s20-s21 — Streaming 基础 + 进阶

> **Claude Code 参考**: `src/services/api/claude.ts`
>
> 重点研究：BetaRawMessageStreamEvent 处理、thinking block、watchdog、非流式回退

- [x] **E-s20.1** 编写 Agent 源码 `agents/s20-basic-streaming/`
- [x] **E-s20.2** 编写教学文档 `docs/zh/s20-basic-streaming.md`
- [x] **E-s20.3** 创建配套数据
- [x] **E-s21.1** 编写 Agent 源码 `agents/s21-advanced-streaming/`
- [x] **E-s21.2** 编写教学文档 `docs/zh/s21-advanced-streaming.md`
- [x] **E-s21.3** 创建配套数据

### s22 — 工具并行执行

> **Claude Code 参考**: `src/services/tools/StreamingToolExecutor.ts`
>
> 重点研究：isConcurrencySafe 标记、sibling abort

- [x] **E-s22.1** 编写 Agent 源码 `agents/s22-parallel-tools/`
- [x] **E-s22.2** 编写教学文档 `docs/zh/s22-parallel-tools.md`
- [x] **E-s22.3** 创建配套数据

### s23 — 启动性能

> **Claude Code 参考**: `src/entrypoints/cli.tsx`（快速路径） + `src/main.tsx`（并行 prefetch）

- [x] **E-s23.1** 编写 Agent 源码 `agents/s23-startup-perf/`
- [x] **E-s23.2** 编写教学文档 `docs/zh/s23-startup-perf.md`
- [x] **E-s23.3** 创建配套数据

---

## 阶段 F-1：Phase 6 — 上下文管理（s24-s26）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 6 章节
>
> Claude Code 源码参考：`src/services/compact/` + `src/utils/toolResultStorage.ts`

- [x] **F-s24** s24 自动压缩 — 参考 `autoCompact.ts` + `compact.ts`
- [x] **F-s25** s25 多层压缩 — 参考 `microCompact.ts` + `query.ts`（reactive）
- [x] **F-s26** s26 大输出处理 — 参考 `toolResultStorage.ts`

> 每课均包含：Agent 源码 + 教学文档 + scenarios + annotations + terminal-recordings

---

## 阶段 F-2：Phase 7 — Agent 智能（s27-s31）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 7 章节
>
> Claude Code 源码参考：`src/tools/AgentTool/` + `src/tools/TodoWriteTool/` + `src/tasks/`

- [x] **F-s27** s27 TodoWrite — 参考 `TodoWriteTool/`
- [x] **F-s28** s28 Subagent 基础 — 参考 `AgentTool/runAgent.ts` + `forkedAgent.ts`
- [x] **F-s29** s29 Subagent 进阶 — 参考 `agentToolUtils.ts`（filterToolsForAgent）
- [x] **F-s30** s30 Skill 系统 — 参考 `SkillTool/` + `ToolSearchTool/`
- [x] **F-s31** s31 Task System — 参考 `tasks/` + `TaskCreateTool/`

---

## 阶段 F-3：Phase 8 — 安全与权限（s32-s34）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 8 章节
>
> Claude Code 源码参考：`src/utils/permissions/`（6300+ 行） + `src/components/permissions/`

- [x] **F-s32** s32 权限规则引擎 — 参考 `permissions/permissions.ts`
- [x] **F-s33** s33 权限 UI — 参考 `components/permissions/`
- [x] **F-s34** s34 子 Agent 权限 — 参考 `runAgent.ts`（permission scoping）

---

## 阶段 F-4：Phase 9 — 扩展生态（s35-s38）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 9 章节
>
> Claude Code 源码参考：`src/services/mcp/`（24 个文件，12000+ 行） + `src/services/plugins/`

- [ ] **F-s35** s35 MCP 客户端 — 参考 `services/mcp/client.ts` + `MCPConnectionManager.tsx`
- [ ] **F-s36** s36 MCP 服务端 — 参考 `services/mcp/config.ts`
- [ ] **F-s37** s37 会话持久化 — 参考 `utils/sessionStorage.ts` + `screens/ResumeConversation.tsx`
- [ ] **F-s38** s38 Plugin System — 参考 `services/plugins/`

---

## 阶段 F-5：Phase 10 — 多 Agent（s39-s43）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 10 章节
>
> Claude Code 源码参考：`src/coordinator/` + `src/utils/swarm/` + `src/utils/worktree.ts`

- [ ] **F-s39** s39 Agent 定义 — 参考 `AgentTool/loadAgentsDir.ts`
- [ ] **F-s40** s40 Coordinator — 参考 `coordinator/coordinatorMode.ts`
- [ ] **F-s41** s41 Team + Mailbox — 参考 `swarm/teammateMailbox.ts`
- [ ] **F-s42** s42 Team Protocols — 参考 `swarm/permissionSync.ts`
- [ ] **F-s43** s43 Worktree 隔离 — 参考 `utils/worktree.ts` + `EnterWorktreeTool/`

---

## 阶段 F-6：Phase 11 — 产品化（s44-s48）

> **⚠️ 必读**：`reference/claude-code-architecture.md` Phase 11 章节
>
> Claude Code 源码参考：`src/query.ts`（错误恢复） + `src/entrypoints/cli.tsx`（feature flag）

- [ ] **F-s44** s44 递进式错误恢复 — 参考 `query.ts`（error recovery pipeline）
- [ ] **F-s45** s45 Feature Flags — 参考 `cli.tsx`（feature() polyfill）+ CCB README 30 个 flag
- [ ] **F-s46** s46 打包与分发 — 参考 `build.mjs` + `package.json`（bin/exports）
- [ ] **F-s47** s47 Native 能力 — 参考 `packages/`（4 种策略对比）
- [ ] **F-s48** s48 遥测与诊断 — 参考 `startupProfiler.ts` + `screens/Doctor.tsx`

---

## 持续任务

- [ ] **C-1** 英文文档翻译（`docs/en/`）— 在所有中文文档完成后进行
- [ ] **C-2** extract-content.ts 更新 — 每新增课程后更新 scenarioModules / annotationModules 映射
- [ ] **C-3** 构建验证 — 每批课程完成后执行 `npm run build` 确认 111+ 页面正常生成
- [ ] **C-4** constants.ts 对齐 — 确保 VERSION_META 中的 loc 数值与实际代码行数一致

---

## 每课交付清单（Checklist）

每课必须交付以下 5 个产物，缺一不可：

```
□ agents/sXX-slug/          — 可独立运行（npm install && npm run dev）
□ docs/zh/sXX-slug.md       — 精简版教学文档（引导至其他 Tab）
□ web/src/data/scenarios/sXX.json        — 模拟器场景
□ web/src/data/annotations/sXX.json      — mermaid 架构图 + 设计决策 + 对照
□ web/src/data/terminal-recordings/sXX.json — 终端回放数据
```

每课编写前必须：

```
□ 阅读 reference/claude-code-architecture.md 对应章节
□ 阅读 Claude Code 源码对应文件（路径见 architecture.md）
□ 确认 PLAN.md 中的 coreAddition / keyInsight / claudeCodeRef
```
