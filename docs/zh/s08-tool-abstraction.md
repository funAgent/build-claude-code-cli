# s08 — Tool 抽象：定义工具的标准接口

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

## 实现要点

s07 的循环里可能有 `if (name === "bash")` 这类硬编码。  
s08 改为用 `Map`（或注册表）按名称查找，统一走 `call`：

```typescript
const tool = this.toolMap.get(block.name);
const result = await tool.call(block.input, this.context);
```

**新增工具只需把实例放进 tools 列表 / 注册表，循环主体可以零修改。**

## 运行验证

```bash
cd agents/s08-tool-abstraction
cp .env.example .env   # 填入 API Key
npx tsx src/cli.ts "列出当前目录"
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

## 练习

1. 给 `Tool` 增加可选字段 `needsPermissions`，并在循环或注册层预留校验钩子。  
2. 实现一个 `timeTool`：无参数，返回 ISO 时间字符串。  
3. 写单测：模拟模型返回未知 `tool_use` 名称时，循环是否返回清晰的 `tool_result` 错误。
