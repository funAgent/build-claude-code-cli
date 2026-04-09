# s08 — Tool 抽象：定义工具的标准接口

> **Add tools without touching the loop**

`[ Phase 2: 工具系统 ]` · 工具数: 1 · 代码量: ~150 行

---

## 前置知识

- 需要完成: s07 [成本追踪]

## 你将学到

- Tool 接口的设计——name + schema + call 三元组
- 工厂函数模式创建工具
- ToolContext 注入运行环境，避免全局状态
- 注册表模式让新增工具无需改循环

## 问题场景

在 s03–s07 中，`BashTool` 是硬编码在 Agent 循环里的。如果要加更多工具，循环代码会变成一长串 `if-else`。

**核心矛盾**：工具和循环紧耦合——每增加一个工具，就要改一次循环逻辑，难以维护和测试。

## 设计决策

### 核心三元组：name + schema + call

一个工具在模型侧与运行时侧各承担三件事：

1. **name** — 告诉模型这个工具叫什么
2. **schema** — 告诉模型参数格式（JSON Schema）
3. **call** — 拿到解析后的参数后执行的函数

```typescript
interface Tool {
  name: string;
  description: string;
  inputSchema: Anthropic.Tool["input_schema"];
  isReadOnly?: boolean;
  call(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
```

### buildTool 工厂函数

用工厂函数创建工具，集中校验与类型约束，避免每个工具手写重复的样板代码。

```typescript
export const bashTool = buildTool({
  name: "bash",
  description: "Execute a shell command.",
  inputSchema: { ... },
  call: async (input, context) => { ... },
});
```

### ToolContext：工具的运行环境

每次调用把当前工作目录、可取消信号等注入工具，而不是让工具自己去猜全局状态：

```typescript
interface ToolContext {
  cwd: string;
  abortSignal?: AbortSignal;
}
```

<abbr data-tip="用于取消异步操作的标准 API。当用户中断操作或超时时，通过 AbortSignal 通知工具停止执行。浏览器 fetch 和 Node.js 都支持。">AbortSignal</abbr> 让工具可以被优雅地取消——用户按 Ctrl+C 时，正在执行的 shell 命令会被终止而不是继续运行。

## 实现要点

s07 的循环里可能有 `if (name === "bash")` 这类硬编码。
s08 改为用 <abbr data-tip="一种 key-value 数据结构，这里用工具名作 key 查找对应工具实例。比 if-else 链更优雅、更易扩展，新增工具只需 put 进 Map 即可。">Map 注册表</abbr>按名称查找，统一走 `call`：

```typescript
const tool = this.toolMap.get(block.name);
const result = await tool.call(block.input, this.context);
```

**新增工具只需把实例放进 tools 列表 / 注册表，循环主体可以零修改。**

## 运行验证

```bash
cd agents/s08-tool-abstraction
npm install
cp .env.example .env   # 填入 API Key
npm run dev "列出当前目录"
```

## 对照 Claude Code

| 概念 | 教学版 | Claude Code |
|------|--------|-------------|
| Tool 类型 | 较薄的 `Tool` 接口 | `Tool.ts` 中更完整的类型系统 |
| 工具元数据 | `isReadOnly` | `isReadOnly`、`needsPermissions`、并发安全等 |
| 上下文 | `ToolContext`（cwd 等） | `ToolUseContext`（权限、UI、abort 等） |
| 工厂 | `buildTool` | `defineTool` / `buildTool` 等 |

生产环境里权限、并发与 UI 会显著放大类型复杂度，但 **name + schema + call** 这一骨架是一致的。

## 深入思考

1. **为什么优先用接口而不是 class？** 接口允许多种实现（纯对象、函数闭包、class），便于测试时替换假实现。
2. **`isReadOnly` 有什么用？** 为后续只读模式、权限与并发策略打标签，避免在循环里硬编码「哪些工具算读」。
3. **工具名与 API 的 `tools` 数组如何对应？** `toApiTools()` 应保证顺序稳定（与 s12 的 prompt cache 话题衔接）。
4. **`buildTool` 和直接写对象有什么区别？** `buildTool` 可以在创建时做统一校验（检查 name 非空、schema 格式正确等），避免每个工具重复校验逻辑。直接写对象也可以，但容易遗漏。Claude Code 的 `defineTool` 也做了类似的事。

## 练习

1. 给 `Tool` 增加可选字段 `needsPermissions`，并在循环或注册层预留校验钩子。
2. 实现一个 `timeTool`：无参数，返回 ISO 时间字符串。
3. 写单测：模拟模型返回未知 `tool_use` 名称时，循环是否返回清晰的 `tool_result` 错误。

<details>
<summary>练习 2 参考实现</summary>

用 `buildTool` 创建一个最简单的工具：

```typescript
export const timeTool = buildTool({
  name: "time",
  description: "Get the current date and time in ISO 8601 format.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
  call: async () => {
    return {
      output: new Date().toISOString(),
      exitCode: 0,
    };
  },
});
```

注册到 Agent：

```typescript
const tools = [bashTool, timeTool];
const toolMap = new Map(tools.map((t) => [t.name, t]));
```

**观察**：注册后模型就能在需要时自动调用 `time` 工具。试试问"现在几点了？"，看模型是否会使用这个工具。

</details>

## 下一课预告

有了工具抽象，接下来就可以添加更多具体工具了。下一课 **s09 文件读取工具** 将实现 `read_file` 和 `list_files`，让 Agent 能直接操作文件系统，而不必通过 bash 命令。
