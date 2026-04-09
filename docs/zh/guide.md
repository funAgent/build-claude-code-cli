# 从一个循环到生产级 Agent CLI — 架构全景与设计哲学

> 读完这篇文章，你能从零画出一个生产级 Agent CLI 的架构图，解释每一层为什么存在，说清楚 Claude Code 的关键设计取舍。

---

## 第〇章：开宗明义

**Agent 不是聊天机器人。**

聊天机器人是一问一答——你说一句，它回一句，然后等你下一句。Agent 是一个 **while 循环**——你给它一个目标，它自己决定用什么工具、执行多少步、何时停下来。

这个区别听起来简单，但它改变了一切：架构、安全模型、上下文管理、错误处理、用户体验……本文覆盖的所有主题，都源于这一个根本差异。

### 七层同心圆

一个生产级 Agent CLI 由七层能力构成，从内到外逐层展开：

```
┌───────────────────────────────────────────────────────────┐
│                  ⑦ 生态与运维                              │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                ⑥ 多 Agent 协作                       │  │
│  │  ┌───────────────────────────────────────────────┐  │  │
│  │  │              ⑤ 权限与安全                      │  │  │
│  │  │  ┌─────────────────────────────────────────┐  │  │  │
│  │  │  │           ④ 终端 UI                      │  │  │  │
│  │  │  │  ┌───────────────────────────────────┐  │  │  │  │
│  │  │  │  │        ③ 上下文管理                │  │  │  │  │
│  │  │  │  │  ┌─────────────────────────────┐  │  │  │  │  │
│  │  │  │  │  │      ② 工具系统              │  │  │  │  │  │
│  │  │  │  │  │  ┌───────────────────────┐  │  │  │  │  │  │
│  │  │  │  │  │  │   ① Agent Loop        │  │  │  │  │  │  │
│  │  │  │  │  │  │   (while 循环)         │  │  │  │  │  │  │
│  │  │  │  │  │  └───────────────────────┘  │  │  │  │  │  │
│  │  │  │  │  └─────────────────────────────┘  │  │  │  │  │
│  │  │  │  └───────────────────────────────────┘  │  │  │  │
│  │  │  └─────────────────────────────────────────┘  │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

每一层都回答一个问题：

| 层 | 问题 | 一句话回答 |
|---|------|-----------|
| ① Agent Loop | Agent 怎么运转？ | 一个 while 循环，LLM 自己决定何时停 |
| ② 工具系统 | Agent 怎么做事？ | JSON Schema + execute 函数，LLM 看描述就会用 |
| ③ 上下文管理 | Agent 怎么记住？ | Context window 是唯一的工作记忆，要精打细算 |
| ④ 终端 UI | 用户怎么交互？ | React 组件模型 + 流式传输，逐 token 响应 |
| ⑤ 权限与安全 | 谁来控制 Agent？ | 默认不信任，每个操作都需授权 |
| ⑥ 多 Agent 协作 | 复杂任务怎么办？ | 拆分给多个 Agent，各自隔离并行 |
| ⑦ 生态与运维 | 怎么变成产品？ | MCP 协议 + 插件 + 错误恢复 + 打包发布 |

接下来，我们逐层展开。

---

## 第一章：心脏 — Agent Loop

> *"One loop is all you need."*

### 为什么需要循环

传统程序是人写逻辑、机器执行。Agent 反过来：**LLM 写逻辑、程序执行**。while 循环是连接两个世界的桥。

没有循环，你有的是两个割裂的能力：能调 LLM 得到文本回答（聊天机器人），能执行 shell 命令（脚本工具）。用户得手动在两者之间搬运结果。加上循环后，LLM 可以自动决定何时调用工具、自动理解执行结果、自动推理下一步——这就是 Agent。

### 核心机制

整个 Agent 就是这 4 步的循环：

```typescript
while (true) {
  // 1. 把消息发给 LLM（带工具定义）
  const response = await llm.call(messages, tools);

  // 2. 把 LLM 回复加入消息历史
  messages.push({ role: "assistant", content: response.content });

  // 3. LLM 决定停下来了？退出循环
  if (!hasToolUse(response)) break;

  // 4. 执行工具，把结果作为 user message 送回
  const results = await executeTools(response.toolCalls);
  messages.push({ role: "user", content: results });
}
```

注意第 3 步：**是 LLM 决定何时停止**，不是你写 if/else。LLM 通过返回纯文本（而非 `tool_use`）来告诉循环"我做完了"。这就是 Agent 的自主性来源。

### 关键设计决策

| 决策 | 选了什么 | 没选什么 | 为什么 |
|------|---------|---------|--------|
| 循环条件 | `while(true)` + 检测 content 中的 tool_use | `stop_reason === "tool_use"` | 后者在万级用户量下偶尔不可靠 |
| 轮次限制 | 固定上限 → token 预算 | 无限制 | 没有安全阀，一个出错的 prompt 可能无限循环 |
| 工具结果格式 | `tool_result` 作为 user message | 塞进 system prompt | API 要求严格的 user/assistant 交替 |
| 错误处理 | `is_error: true` 标记 | 抛异常终止 | 模型看到错误会尝试修正，这就是"自我修正"能力 |

> **架构洞察：** 传统程序出错就崩溃。Agent 出错会"想一想"为什么错了、换个方式重试。这个能力不需要你写任何重试逻辑——只需要把错误信息作为 `tool_result` 送回 LLM，它自己就会尝试修正。这是 Agent 最反直觉、也最强大的特性。

### 消息流的全貌

理解了循环，还要理解循环中流动的数据——`messages` 数组：

```
轮次 1:
  messages: [
    { role: "user",      content: "帮我看看项目结构" }
    { role: "assistant",  content: [tool_use: glob("src/**")] }
    { role: "user",      content: [tool_result: "src/a.ts\nsrc/b.ts"] }
    { role: "assistant",  content: "项目有两个文件..." }
  ]

轮次 2:
  messages: [
    ...前 4 条...,
    { role: "user",      content: "帮我重构 a.ts" }
    { role: "assistant",  content: [tool_use: file_read("src/a.ts")] }
    { role: "user",      content: [tool_result: "文件内容..."] }
    { role: "assistant",  content: [tool_use: file_edit("src/a.ts", ...)] }
    { role: "user",      content: [tool_result: "OK"] }
    { role: "assistant",  content: "重构完成，改了..." }
  ]
```

`messages` 数组是 Agent 的**完整记忆**。它会一直增长，直到撞上 context window 的上限——这就是第三章"上下文管理"要解决的核心问题。

### 📚 对应课程

- [s00 AI API 入门](/zh/s00) — Anthropic SDK 调用基础
- [s01 CLI 脚手架](/zh/s01) — Commander.js + 项目结构
- [s02 子进程与安全执行](/zh/s02) — spawn + 沙箱基础
- [s03 Agent Loop](/zh/s03) — **while 循环核心，整个 Agent 的心脏**
- [s04 消息管理](/zh/s04) — messages 数组的类型系统
- [s05 错误处理](/zh/s05) — 基础错误分类与恢复
- [s06 配置管理](/zh/s06) — 多层配置加载
- [s07 成本追踪](/zh/s07) — token 计数与费用统计

---

## 第二章：双手 — 工具系统

> *"好的工具设计让 LLM 通过 description 和 schema 就能正确使用，不需要看实现。"*

### 为什么需要工具抽象

s03 的循环里，bash 工具是硬编码的：`if (name === "bash") { ... }`。想加 file_read？再加一段 if。想加 grep？再加一段。循环代码越来越臃肿，每加一个工具都要改循环逻辑。

解决方案很经典——**把变化的部分抽出来**：每个工具只负责定义自己的名字、参数格式和执行逻辑；循环只负责调度。

### 核心三元组

一个工具在 Agent 系统中做三件事：

```typescript
interface Tool {
  name: string;                    // 告诉 LLM 这个工具叫什么
  description: string;             // 告诉 LLM 什么时候用、怎么用
  inputSchema: JSONSchema;         // 告诉 LLM 参数格式
  isReadOnly?: boolean;            // 告诉调度器能否并行
  call(input, context): Result;    // 拿到参数后执行
}
```

注意 `description` 的重要性——它不是给人看的注释，是给 LLM 看的使用手册。description 写得好，LLM 就能正确使用工具；写得差，LLM 就会乱用或不用。**工具描述的质量直接决定 Agent 的智能程度。**

### 工具分类金字塔

```
风险递增 ↑

  ┌─────────────────────┐
  │   执行（bash）       │  可能做任何事，风险最高
  ├─────────────────────┤
  │   写入               │  修改文件系统
  │   file_write         │
  │   file_edit          │
  ├─────────────────────┤
  │   只读               │  不改变任何状态
  │   file_read          │
  │   grep / glob / ls   │
  └─────────────────────┘
```

这个分类不只是概念——它直接驱动两个关键机制：

1. **权限**（第五章）：只读工具默认 `allow`，写入工具默认 `ask`，危险命令 `deny`
2. **并行**（第四章）：只读工具可以并行执行，写入工具必须串行

### file_edit 的设计哲学：精确替换 vs 整文件覆写

为什么不直接让 LLM 用 `file_write` 重写整个文件？

| 方案 | 优点 | 缺点 |
|------|------|------|
| 整文件覆写 | 实现简单 | LLM 必须输出完整文件（浪费 token）；大文件容易丢失内容 |
| 精确替换（old_string → new_string） | 省 token；安全（只改想改的部分）；git diff 友好 | 要求 old_string 唯一匹配 |

Claude Code 选择精确替换。代价是 LLM 偶尔会因为 old_string 不唯一而失败——但这比"悄悄覆盖掉没改的代码"安全得多。

### 工具注册表

所有工具注册到一个 `Map<string, Tool>` 中，循环按名称查找：

```typescript
const tool = toolRegistry.get(toolName);
const result = await tool.call(input, context);
```

为什么用 Map 而非硬编码数组？因为工具集需要**动态组合**：子 Agent 可能只能用一部分工具，Coordinator 和 Worker 的工具池不同（第六章），MCP 连接的外部工具需要运行时注册（第七章）。

> **架构洞察：** 工具注册表有一个隐藏的约束——**排序必须稳定**。因为工具列表会作为 API 参数发送，参与 Prompt Cache 的键计算。如果工具顺序不稳定，cache 命中率骤降，每轮对话的成本翻倍。这就是为什么要用显式排序而非 `Object.keys()`。

### 📚 对应课程

- [s08 Tool 抽象](/zh/s08) — 定义工具的标准接口
- [s09 文件工具](/zh/s09) — FileRead + FileWrite 实现
- [s10 编辑工具](/zh/s10) — 精确替换 vs 整文件覆写
- [s11 搜索工具](/zh/s11) — Grep + Glob，先找到再修改
- [s12 工具注册表](/zh/s12) — Map 管理 + 稳定排序

---

## 第三章：记忆 — 上下文管理

> *"Context window 是 Agent 唯一的工作记忆。用有限的窗口做无限长的对话。"*

这是整个 Agent 工程中**技术含量最高**的部分。所有其他模块都在增加能力，只有这个模块在和物理限制（200K token 上限）搏斗。

### 根本矛盾

每轮对话都在往 `messages` 数组里加东西：用户消息、LLM 回复、工具调用、工具结果。30 轮对话下来可能到 180K token。而模型上下文窗口是 200K，减去输出预留 16K，有效空间只有 184K。

**对话越长，Agent 越聪明（有更多上下文）；但对话越长，越接近窗口上限。** 这是 Agent 架构中最核心的张力。

解决这个矛盾需要四层机制协同工作：

### 第一层：System Prompt 架构

System prompt 是 Agent 的"长期记忆"——每次 API 调用都会发送，告诉 LLM 它是谁、有什么规则、项目是什么样的。

```
System Prompt 分层：

  ┌────────────────────────────┐
  │  身份层                     │  "你是一个 CLI Agent..."
  ├────────────────────────────┤
  │  工具使用规范               │  "读文件前先搜索，编辑用精确替换..."
  ├── DYNAMIC_BOUNDARY ────────┤
  │  环境信息                   │  日期、工作目录、OS
  ├────────────────────────────┤
  │  项目知识（CLAUDE.md）     │  技术栈、约定、coding style
  └────────────────────────────┘
```

CLAUDE.md 是一个关键设计：**它是给 Agent 看的 README**。人类读 README 了解项目；Agent 读 CLAUDE.md 了解项目约定。三级加载：项目根目录 → 用户全局 → 父目录，层层覆盖。

### 第二层：Prompt Cache

每次 API 调用都要发送完整的 system prompt。一个有 9 个工具的 Agent，system prompt 约 2000 token。对话 20 轮，就是 40000 token 的 system prompt 费用——但**内容完全一样**。

Prompt Cache 的原理：标记一段前缀为"可缓存"，服务端记住它，后续只要前缀一致就以 cache read 计费（便宜 90%）。

关键实现：把 system prompt 拆成**静态前缀**（身份 + 工具规范，不变）和**动态后缀**（环境 + 项目知识，可能变），只对前缀加 `cache_control: { type: "ephemeral" }`。

```typescript
// 静态块 → 可缓存
{ text: "你是一个 CLI Agent...", cache_control: { type: "ephemeral" } }
// 动态块 → 不缓存
{ text: `当前目录: ${cwd}, 日期: ${date}` }
```

> **架构洞察：** Prompt Cache 不是优化，是生死线。200K 上下文 × 多轮对话，没有 cache 的成本会指数增长。但 cache 有一个陷阱——前缀必须**严格一致**，一个字符变化就会 miss。这就是为什么工具列表排序必须稳定、system prompt 拆分要精心设计。

### 第三层：自动压缩

当 token 数接近窗口上限（约 85%），触发自动压缩：

```
压缩前:
  [摘要前消息] [摘要前消息] ... [最近 2 轮消息]
  ──────────────────────────────────────────────
  ~180K tokens → 快溢出了

压缩后:
  [一段 LLM 生成的摘要] [最近 2 轮消息]
  ──────────────────────────────────────────────
  ~30K tokens → 空间充裕
```

**压缩不是删除历史，是用摘要替换细节——保留记忆的骨架。**

为什么不直接截断旧消息？因为早期决策可能是后续任务的关键上下文。LLM 突然"失忆"会重复做已经做过的事，或者做出与之前矛盾的决策。

实际上有三级压缩策略，从轻到重：

| 级别 | 触发条件 | 做法 | 代价 |
|------|---------|------|------|
| **Micro-compact** | 单个工具结果太大 | 对工具输出做内联摘要 | 丢失细节，保留结论 |
| **Auto-compact** | 总 token 达到阈值 | 用 LLM 摘要整段历史 | 一次额外 API 调用 |
| **Reactive-compact** | `prompt_too_long` 报错 | 紧急压缩，砍到安全线 | 可能丢失较多上下文 |

### 第四层：工具结果预算

`grep` 搜一个大项目可能返回 50K 字符。如果全塞进 `messages`，一次搜索就吃掉 1/4 的上下文窗口。

解决方案：设定每条消息的工具结果预算（如 200K 字符），超过阈值的结果持久化到磁盘，消息中只留一行引用：

```
原始: tool_result = "...50K 字符的搜索结果..."
替换: tool_result = "[内容已存储到 /tmp/tool-result-abc123]"
```

LLM 看到引用后可以用 `file_read` 读取完整内容——但只在需要时才读，避免了"搜一下就把上下文撑爆"。

> **架构洞察：** 上下文管理的本质是一个信息经济学问题：context window 是稀缺资源，每个 token 都有机会成本。System prompt 是"固定成本"（每轮都付），对话历史是"可变成本"（可以压缩），工具结果是"按需成本"（可以外置）。好的 Agent 架构要像管理预算一样管理 token。

### 📚 对应课程

- [s04 消息管理](/zh/s04) — messages 数组的类型与结构
- [s17 System Prompt](/zh/s17) — 分层 prompt 架构
- [s18 CLAUDE.md](/zh/s18) — 项目知识注入
- [s19 Prompt Cache](/zh/s19) — cache_control + 静态/动态分界
- [s24 自动压缩](/zh/s24) — 阈值检测 + LLM 摘要
- [s25 多层压缩策略](/zh/s25) — micro / auto / reactive 三级
- [s26 工具结果预算](/zh/s26) — 大输出持久化 + 引用替换

---

## 第四章：感官 — 终端 UI 与流式传输

> *"终端不等于 console.log。用 React 组件模型构建 TUI，让用户感受到即时响应。"*

### 为什么用 React 渲染终端

终端 UI 看起来是"打印文本"，但实际上有复杂的状态管理需求：消息在流式更新、spinner 在旋转、权限弹窗在等待输入、状态栏在实时显示 token 消耗……用 `console.log` 写这些会变成一团意大利面。

[Ink](https://github.com/vadimdemedes/ink) 把 React 的组件模型带到终端：声明式 UI、状态驱动更新、组件复用。终端中的每一个区域（消息列表、输入框、状态栏）都是一个 React 组件。

```
终端 REPL 布局：

  ┌─────────────────────────────────────────┐
  │  MessageList                             │  消息历史（滚动）
  │  ├── UserMessage                         │
  │  ├── AssistantMessage (streaming...)     │
  │  └── ToolResult                          │
  ├─────────────────────────────────────────┤
  │  PromptInput                             │  多行输入框
  ├─────────────────────────────────────────┤
  │  StatusBar  [tokens: 12.3K | $0.04]     │  状态信息
  └─────────────────────────────────────────┘
```

### 流式传输：不只是好看

LLM 生成一个回复可能需要 5-10 秒。没有 streaming，用户盯着空白屏幕等 10 秒。有了 streaming，用户可以**边看边理解**，感知上的等待时间大幅缩短。

但 streaming 的价值远不止用户体验。当 LLM 在流式生成中发出 `tool_use` block 时，你可以在它还没生成完时就开始准备执行工具——这就是 **streaming tool execution**。

```
传统模式:
  LLM 生成(5s) → 解析 tool_use → 执行工具(2s)
  总耗时: 7s

流式模式:
  LLM 生成中... → 检测到 tool_use → 立即执行
  │←── 重叠 ──→│
  总耗时: ~5s
```

### 并行工具执行

LLM 经常一次返回多个工具调用。关键判断：哪些可以并行？

```
安全并行:                     必须串行:
  glob("src/**")              file_write("config.json")
  file_read("pkg.json")            ↓ 依赖写入结果
  file_read("tsconfig.json")  bash("node validate.js")
  ──→ Promise.all             ──→ 顺序执行
```

解决方案：每个工具注册时声明 `isReadOnly`。只读工具 `Promise.all` 并行，写入工具顺序执行。**用标记而不是猜测。**

### 启动性能

CLI 工具的第一印象就是启动速度。Agent 启动需要做很多事：检测项目根目录、加载 CLAUDE.md、验证 API key、检查 Git 状态……串行执行可能需要 450ms。

解决方案：`Promise.all` 并行预取。4 个独立的 I/O 操作并行执行，总耗时 = 最慢那个 ≈ 200ms。

> **架构洞察：** 流式传输改变了 Agent 的并发模型。传统的"请求-响应"是同步的；流式模式下，LLM 生成、工具执行、UI 更新三件事可以同时进行。这种"流水线化"不仅提升了速度，还让用户随时可以中断（Ctrl+C），而不是只能在请求结束后才能操作。

### 📚 对应课程

- [s13 Ink 入门](/zh/s13) — React 渲染终端
- [s14 消息列表](/zh/s14) — 对话历史组件
- [s15 输入框](/zh/s15) — 多行编辑 + 命令历史
- [s16 REPL 主屏](/zh/s16) — 组装完整 TUI
- [s20 基础 Streaming](/zh/s20) — 逐 token 显示
- [s21 Streaming 进阶](/zh/s21) — thinking + 工具流式 + 容错
- [s22 并行工具执行](/zh/s22) — isReadOnly 标记 + Promise.all
- [s23 启动性能优化](/zh/s23) — 并行预取 + 延迟加载

---

## 第五章：免疫系统 — 权限与安全

> *"Agent 能做的事越多，控制就得越精细。安全不是一道检查，是层层防御。"*

### 为什么默认不信任

一个有 `bash` 工具的 Agent，理论上可以执行任何命令。用户说"清理临时文件"，Agent 可能执行 `rm -rf /tmp/*`——如果它理解错了呢？如果它执行 `rm -rf /` 呢？

给 AI 无限制的系统权限，就像给一个刚入职的实习生 root 权限。它很聪明，但你不完全了解它会做什么。

### 三级权限模型

```
  allow  ✓  直接放行（只读操作、已批准的安全命令）
  deny   ✗  直接拒绝（rm -rf /、访问 ~/.ssh）
  ask    ?  暂停执行，弹窗询问用户

  匹配优先级：deny > allow > 默认 ask
```

为什么 deny 优先于 allow？考虑这个场景：规则 A 允许所有 bash 命令，规则 B 禁止 `rm -rf`。如果 allow 优先，规则 A 会放行 `rm -rf`。**安全系统中，禁止必须压过允许。**

### 权限规则的粒度

不是简单的"允许/禁止 bash"，而是可以细到具体参数：

```
规则示例：
  allow  bash  command: "npm test"        ← 具体命令放行
  allow  bash  command: "git *"           ← 通配符
  deny   bash  command: "rm -rf *"        ← 禁止危险模式
  ask    file_write                        ← 所有写文件都问
```

### 四种安全模式

不同场景需要不同的安全等级：

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| **default** | 按规则决定，未匹配的写操作 ask | 日常使用 |
| **acceptEdits** | 文件编辑自动批准，bash 仍 ask | 信任 Agent 的编辑能力 |
| **bypassPermissions** | 全部自动批准 | CI/CD 环境 |
| **plan** | 所有写操作 deny | 只分析不执行 |

### 子 Agent 权限：只能更严

这是权限系统中最重要的设计原则：

```
父 Agent 的权限                 子 Agent 的权限
┌────────────────────┐         ┌────────────────────┐
│ allow: bash        │   ──→   │ ask: bash           │ ← 不继承 allow
│ session allow: *   │         │ session allow: 无    │ ← 不继承 session
│ mode: default      │         │ mode: default       │ ← 不能放宽
└────────────────────┘         └────────────────────┘
```

用户对主 Agent 说"允许写文件"（session allow），是基于**信任**——"我看到了你要做什么，我批准"。子 Agent 的操作用户看不到（独立上下文），所以不能继承这种信任。

如果子 Agent 能放宽权限，就等于给了 Agent 一个"提权后门"：主 Agent 受限时，创建一个不受限的子 Agent 绕过限制。

> **架构洞察：** 权限系统的设计哲学是"最小权限原则"的工程实践。每个 Agent 只应拥有完成任务所需的最小权限集。父子关系的权限只能收紧、不能放宽——这和操作系统中进程权限继承的原则一致。安全不是功能，是约束。

### 📚 对应课程

- [s02 子进程与安全执行](/zh/s02) — spawn 沙箱基础
- [s32 权限规则引擎](/zh/s32) — allow / deny / ask + 匹配优先级
- [s33 权限 UI](/zh/s33) — 交互式审批对话框
- [s34 子 Agent 权限](/zh/s34) — 继承收紧 + session 隔离

---

## 第六章：分身术 — 多 Agent 协作

> *"复杂任务不需要一个更聪明的 Agent，而是一群各司其职的 Agent。"*

### 为什么需要多 Agent

单 Agent 面对大型任务有两个瓶颈：

1. **上下文饱和**：分析代码质量（30 条消息、大量工具输出）之后再生成文档，前面的分析细节已经把 context 填满了
2. **串行瓶颈**：同时修改 5 个文件、运行测试、更新文档，单 Agent 一个一个做太慢

解决方案：把大任务拆成小任务，分给多个 Agent 并行处理。每个 Agent 有**干净的上下文**，只装自己需要的信息。

### 从规划到执行的分层架构

多 Agent 协作是逐层构建的，不是一步到位的：

**第一层：规划先行（TodoWrite）**

在动手之前，先让 Agent 列出计划。好处不只是"看起来有条理"：

- **可观测**：用户可以看到 Agent 打算做什么，在它做错之前就纠正
- **可恢复**：中途中断后，可以从上次完成的步骤继续
- **可并行**：拆成独立步骤后，相互无依赖的步骤可以并行

**第二层：子 Agent（上下文隔离）**

```
主 Agent（满载上下文）
  │
  ├── 子 Agent A: "分析 auth 模块"
  │     └── 干净上下文，只有任务描述
  │
  └── 子 Agent B: "分析 db 模块"
        └── 干净上下文，只有任务描述

共享：文件系统（同一个 cwd）
隔离：消息历史、工具集（可限制）、权限（只能更严）
```

子 Agent 的关键约束：**深度限制**。子 Agent 可以再创建子 Agent，但必须有最大深度（如 3 层），否则会无限嵌套。

**第三层：Coordinator 模式（Leader-Worker 分工）**

Coordinator 是分工更明确的多 Agent 模式。核心设计：**工具池隔离**。

```
Coordinator（Leader）              Worker
  可用工具:                         可用工具:
  ├── agent（创建 Worker）          ├── file_read / file_write
  ├── send_message                  ├── bash / grep / glob
  └── task_stop                     └── 无 agent 工具!
                                        ↑ 不能递归创建子 Agent
```

Leader 只做调度，不直接操作文件。Worker 只做执行，不能再分派任务。这种分离保证了架构的**可预测性**——你知道 Leader 不会自己去改文件，Worker 不会自己去创建更多 Worker。

**第四层：通信（文件邮箱）**

多个 Agent 之间怎么通信？不用 Redis，不用 RabbitMQ——**文件系统就是最可靠的消息队列**。

```
~/.agent-cli/teams/my-team/inboxes/
├── leader.json       ← Leader 的收件箱
├── worker-1.json     ← Worker-1 的收件箱
└── worker-2.json     ← Worker-2 的收件箱
```

JSON 文件即队列：写入就是发消息，读取就是收消息。零依赖、零配置、天然持久化。

**第五层：隔离（Git Worktree）**

多个 Worker 同时修改代码，文件冲突怎么办？

Git Worktree 给每个 Agent 一个平行世界——独立目录、独立分支。Worker-1 在 `.claude/worktrees/agent-abc/` 改 auth.ts，Worker-2 在 `.claude/worktrees/agent-def/` 改 auth.ts，互不干扰。

```
  主仓库/
  ├── .claude/worktrees/
  │   ├── agent-abc/     ← Worker-1 的工作区（分支 worktree-agent-abc）
  │   └── agent-def/     ← Worker-2 的工作区（分支 worktree-agent-def）
  └── src/               ← 主工作区
```

> **架构洞察：** 多 Agent 系统最难的不是"怎么并行"，而是"怎么不冲突"。Claude Code 用三层隔离解决：**上下文隔离**（独立消息历史）、**文件隔离**（Git Worktree）、**权限隔离**（只能更严）。每一层都在减少 Agent 之间互相干扰的可能性。

### 📚 对应课程

- [s27 TodoWrite](/zh/s27) — 先规划再执行
- [s28 Subagent 基础](/zh/s28) — 上下文隔离 + 工具限制
- [s29 Subagent 进阶](/zh/s29) — 深度控制 + 输出回传
- [s30 Skill 系统](/zh/s30) — 按需加载知识到工具结果
- [s31 Task System](/zh/s31) — 持久化任务与依赖图
- [s39 Agent 定义](/zh/s39) — 声明式配置（Markdown frontmatter）
- [s40 Coordinator](/zh/s40) — Leader-Worker 编排 + 工具池隔离
- [s41 Team Mailbox](/zh/s41) — 文件邮箱通信
- [s42 Team Protocols](/zh/s42) — 协商协议（权限请求/审批）
- [s43 Worktree 隔离](/zh/s43) — 每个 Agent 独立 Git 分支

---

## 第七章：生态与运维 — 从工具到产品

> *"开发工具做出来是 10%，让用户能用、好用、持续能用是 90%。"*

### 可扩展：MCP + Plugin + Skill

Agent 的工具集不能全靠内置。GitHub API、Slack、数据库、CI/CD——不可能为每个第三方服务都写一个工具。

**MCP（Model Context Protocol）** 是解决方案：一个标准化的工具协议。任何实现了 MCP 的服务都可以被 Agent 连接和调用，就像 USB 让任何设备都能即插即用。

```
Agent CLI 的双重身份：

  作为 MCP 客户端:                作为 MCP 服务端:
  连接外部 MCP 服务               被 IDE/编排器调用
  ├── GitHub MCP                  ├── 暴露 bash 工具
  ├── Slack MCP                   ├── 暴露 file_read
  └── Database MCP                └── 暴露 grep / glob
```

三种扩展机制各有定位：

| 机制 | 解决什么 | 深度 |
|------|---------|------|
| **MCP** | 工具的外部连接 | 标准协议，调用远程工具 |
| **Plugin** | Agent 行为扩展 | 深度集成，注入 hooks、配置、UI |
| **Skill** | 知识的按需注入 | SKILL.md 文件，通过 tool_result 注入上下文 |

Skill 的设计特别精妙：知识不放在 system prompt（每次调用都付 token），而是通过工具调用按需加载到 `tool_result` 中（只在这一轮出现）。长对话中节省的 token 成本非常显著。

### 可恢复：会话持久化 + 错误恢复

**会话持久化**：大型重构做到一半要去开会。明天回来，Agent 完全不记得昨天做了什么。解决方案：每条消息用 JSONL 格式追加写入磁盘，`--resume` 一键恢复。

**错误恢复**：Agent 长时间连着 LLM API，限流、过载、超时是家常便饭。一律 `throw` 退出？用户会频繁看到"对话白跑"。

递进式错误恢复策略：

```
错误发生
  ↓
1. 分类 → rate_limit / server_overload / prompt_too_long / auth / ...
  ↓
2. 可重试？→ 指数退避 + jitter + Retry-After
  ↓ 重试失败
3. 可降级？→ 压缩上下文 / 换模型
  ↓ 降级失败
4. 熔断 → 连续 5 次失败，30s 内快速拒绝
  ↓
5. 告诉用户 → 清晰的错误信息 + 建议操作
```

关键设计：**前台请求和后台任务的重试策略不同**。用户正在等的对话值得重试；后台摘要/标题任务失败了不值得重试放大流量。

### 可控制：Feature Flags

新功能不能一发版就全量。Feature flags 三层架构：

```
  编译期 DCE     →  feature('X') === false 时代码直接不打包
  运行时 env     →  FEATURE_X=true 环境变量强开/关
  灰度发布       →  hash(userId) % 100 < 50? 放量 50%
```

编译期 DCE（Dead Code Elimination）的价值不只是包体小——未启用的代码路径**根本不存在于产物中**，安全审计范围更小，不可能因配置错误意外激活。

### 可交付：打包与发布

用户不会 `git clone` 你的项目再自己编译。`npm install -g your-cli` 一条命令就要能用。

esbuild 单文件打包：所有 `import` 打进一个 `.js` 文件（约 4MB），外部化 native 依赖（`fsevents` 等），`package.json` 的 `bin` 字段声明 CLI 入口。发布后用户全局安装，直接输命令名使用。

### 可观测：遥测与诊断

> *You can't optimize what you don't measure.*

启动剖析：在关键点打 checkpoint（`prefetch_start`、`first_render`），量化每个阶段的耗时。`doctor` 命令做健康检查：Node 版本、API Key、Git、ripgrep 是否可用。采样遥测发送使用数据，帮助改进产品。

> **架构洞察：** 从工具到产品的跨越在于"可预测性"。用户能安装（打包）、能恢复（持久化）、能控制风险（feature flags）、能诊断问题（遥测）、能扩展能力（MCP/Plugin）。缺少任何一个，它就只是一个有趣的 demo，不是一个可靠的产品。

### 📚 对应课程

- [s35 MCP 客户端](/zh/s35) — 连接外部工具服务
- [s36 MCP 服务端](/zh/s36) — 让自己也能被调用
- [s37 会话持久化](/zh/s37) — JSONL + --resume 断点续做
- [s38 Plugin System](/zh/s38) — 第三方深度扩展
- [s44 递进式错误恢复](/zh/s44) — 分类 → 重试 → 降级 → 熔断
- [s45 Feature Flags](/zh/s45) — 编译期 DCE + 运行时 + 灰度
- [s46 打包与分发](/zh/s46) — esbuild → npm publish
- [s47 Native 能力](/zh/s47) — ripgrep 降级 + 能力检测
- [s48 遥测与诊断](/zh/s48) — 启动剖析 + doctor + 采样

---

## 终章：一张图记住全部

```
                         用户输入
                           │
                   ┌───────▼───────┐
                   │  Terminal UI   │ Ink/React 组件
                   │  (流式显示)     │ 逐 token 响应
                   └───────┬───────┘
                           │
              ┌────────────▼────────────┐
              │  Permission Engine       │ allow / deny / ask
              │  (权限检查)              │ 默认不信任
              └────────────┬────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │  System Prompt + CLAUDE.md         │
         │  + Prompt Cache                    │ 身份 + 规则 + 项目知识
         └─────────────────┬─────────────────┘
                           │
              ┌────────────▼────────────┐
              │    Agent Loop            │
              │    while (true) {        │ ← 整个 Agent 的心脏
              │      llm.call()          │
              │      if (!toolUse) break  │
              │      executeTool()       │
              │    }                     │
              └─────┬──────────┬────────┘
                    │          │
           tool_use │          │ 纯文本
                    ▼          ▼
         ┌──────────────┐   返回给用户
         │ Tool Registry │
         │ (工具注册表)  │
         └──────┬───────┘
                │
       ┌────────▼────────┐
       │ 执行工具         │
       │ ├── 只读? 并行   │
       │ └── 写入? 串行   │
       └────────┬────────┘
                │
       ┌────────▼────────┐
       │ 结果处理         │
       │ ├── > 50K? 持久化│
       │ └── token > 85%? │
       │     自动压缩     │
       └────────┬────────┘
                │
       ┌────────▼──────────────┐
       │ 需要拆分任务?          │
       │ ├── Coordinator 调度   │
       │ │   └── Worker × N    │
       │ ├── 文件邮箱通信       │
       │ └── Git Worktree 隔离 │
       └───────────────────────┘
```

### 十个你应该能回答的问题

| # | 问题 | 关键答案 |
|---|------|---------|
| 1 | Agent 和聊天机器人的本质区别？ | Agent 是 while 循环，LLM 决定何时停止；聊天机器人是一问一答 |
| 2 | 为什么 Agent 能"自我修正"？ | 错误信息作为 tool_result 送回 LLM，它会分析错误并换方式重试 |
| 3 | 工具注册表为什么要稳定排序？ | 工具列表参与 Prompt Cache 键计算，排序不稳定会导致 cache miss |
| 4 | 为什么用摘要压缩而不是截断旧消息？ | 截断会丢失关键决策上下文，导致 Agent 重复或矛盾 |
| 5 | Prompt Cache 的前提条件？ | 前缀严格一致。一个字符变化就 cache miss |
| 6 | 为什么子 Agent 的权限只能更严？ | 防止通过创建不受限子 Agent 来绕过权限限制（提权后门） |
| 7 | Coordinator 和 Worker 工具池为什么隔离？ | Leader 不直接操作文件 → 可预测；Worker 不创建子 Agent → 防递归 |
| 8 | 为什么用文件邮箱而不是消息队列？ | CLI 工具零依赖；文件系统天然持久；JSON 即结构化消息 |
| 9 | Feature flags 的三层分别解决什么？ | 编译期：减包体/攻击面；运行时 env：运维开关；灰度：渐进验证 |
| 10 | 从工具到产品缺什么？ | 可安装（打包）+ 可恢复（持久化）+ 可控制（flags）+ 可诊断（遥测） |

---

> **最后一句话：** 整个 Agent CLI 的复杂度都源于一个简单的 while 循环。理解了循环，理解了循环中流动的 messages，理解了 messages 为什么会溢出以及怎么管理——你就理解了 80% 的架构。剩下的 20% 是让它变得安全、快速、可扩展、可发布。
