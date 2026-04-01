# Claude Code 架构要点速查

> 仅用于架构学习参考，不引入任何源码

## 核心循环

- `query.ts` — while(stop_reason === 'tool_use') 主循环
- `QueryEngine.ts` — 消息管理 + API 调用封装
- `StreamingToolExecutor.ts` — 工具并行执行器

## 工具系统

- `Tool.ts` — 工具抽象（name + schema + call）
- `tools.ts` — 工具注册表（排序稳定性影响 prompt cache）
- `buildTool()` — 工具工厂函数

## Prompt 架构

- `constants/prompts.ts` — 系统提示分层组装
- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` — 静态/动态分界（cache 命中点）
- `getUserContext()` — CLAUDE.md 三级加载

## 上下文管理

- `autoCompact` — 阈值触发压缩
- `microCompact` — 轻量压缩
- `applyToolResultBudget` — 工具结果预算

## 多 Agent

- `AgentTool` + `runAgent.ts` — 子 Agent 生成
- `createSubagentContext` — 上下文隔离
- `coordinatorMode.ts` — Leader-Worker 编排
- `teammateMailbox.ts` — 文件邮箱通信
- `worktree.ts` — Git Worktree 隔离

## 权限系统

- `permissions.ts` — 分层规则引擎
- `PermissionPrompt.tsx` — 交互式审批 UI
- `permissionMode` — 模式切换

## 产品化

- `cli.tsx` — 快速路径启动优化
- `bun-shim.ts` — Feature Flag
- `startupProfiler.ts` — 性能诊断
- `build.mjs` — esbuild 打包
