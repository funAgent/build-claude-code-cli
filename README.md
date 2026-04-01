# Build Claude Code

> 从零构建企业级 AI Agent CLI — 逐课拆解 Claude Code 源码架构

## 项目简介

这是一个 **49 课的渐进式教学项目**，教前端开发者从 `npm init` 开始，逐课构建出一个完整的、可安装分发的 AI Agent CLI 产品。

每一课都产出一个可独立运行的完整项目快照，从第一课的 API 调用到最后一课的遥测诊断，最终你会拥有一个架构对标 Claude Code 的企业级 CLI 工具。

## 项目结构

```
build-claude-code/
├── agents/          # 49 课 TypeScript 实现（每课独立可运行）
├── docs/            # 教学文档（Markdown）
│   ├── zh/          # 中文
│   └── en/          # English
├── web/             # Next.js 教学网站
├── data/            # 网站配套数据
├── reference/       # 架构参考笔记
└── PLAN.md          # 详细规划文档
```

## 技术栈

**教学项目：** TypeScript · Node.js · Commander.js · React + Ink · Anthropic SDK · Zod · esbuild · MCP SDK

**教学网站：** Next.js 16 · Tailwind CSS v4 · framer-motion · unified (Markdown)

## 课程大纲

| Phase | 主题 | 课程 |
|-------|------|------|
| 0 | 预备知识 | s00-s02（API、CLI、子进程） |
| 1 | 最小 Agent | s03-s07（循环、消息、错误、配置、成本） |
| 2 | 工具体系 | s08-s12（抽象、文件、编辑、搜索、注册表） |
| 3 | 终端 UI | s13-s16（Ink、消息列表、输入框、REPL） |
| 4 | Prompt 工程 | s17-s19（系统提示、项目规则、缓存） |
| 5 | 流式与性能 | s20-s23（Streaming、并行、启动优化） |
| 6 | 上下文管理 | s24-s26（压缩、多层策略、大输出） |
| 7 | Agent 智能 | s27-s31（规划、子Agent、技能、任务） |
| 8 | 安全与权限 | s32-s34（规则引擎、权限UI、继承） |
| 9 | 扩展生态 | s35-s38（MCP、会话、插件） |
| 10 | 多 Agent | s39-s43（定义、协调、团队、协议、隔离） |
| 11 | 产品化 | s44-s48（恢复、Feature Flag、打包、Native、遥测） |

## 开始学习

```bash
# 克隆项目
git clone https://github.com/xxx/build-claude-code.git
cd build-claude-code

# 启动教学网站
cd web
npm install
npm run dev
```

## 许可证

MIT
