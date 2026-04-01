# s12 — 工具注册表：统一管理所有工具

## 问题场景

从 s08 到 s11，工具数量上升。若仍在 `agent.ts` 里手写数组、`Map` 构建和「只读过滤」，会出现：

- 顺序随手改，**prompt cache** 失效；  
- 读/写工具散落，难以列出与测试；  
- CLI 想加 `/tools`、只读模式时要复制粘贴多处。

需要**单一入口**描述「当前进程里有哪些工具、顺序如何、如何暴露给 API」。

## 设计决策

### assembleToolPool：组装与过滤

- 在一个函数里**固定工具顺序**声明全部工具（如 `glob`、`grep`、`file_read`、…）。  
- `readOnlyMode` 为真时，过滤掉非 `isReadOnly` 工具，无需改循环主体。

### ToolRegistry 接口

封装：`getAll`、`getReadOnly`、`getWritable`、`get(name)`、`toApiTools()`。  
Agent 只依赖 `ToolRegistry`，不直接摸裸数组。

### 稳定排序与 prompt cache

Anthropic 侧 **tools 参数前缀参与缓存键**。顺序抖动会导致缓存命中率骤降，因此：

- 顺序在代码里**显式列表化**；  
- 避免对 `Object.keys` 或未排序集合的隐式顺序。

## 实现要点

```typescript
export function assembleToolPool(options: { readOnlyMode?: boolean } = {}): ToolRegistry {
  const allTools: Tool[] = [
    globTool,
    grepTool,
    lsTool,
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    bashTool,
    taskTool,
    helpTool,
  ];
  const toolMap = new Map(allTools.map((t) => [t.name, t]));
  const filtered = options.readOnlyMode ? allTools.filter((t) => t.isReadOnly) : allTools;
  return { /* get / toApiTools 使用 filtered */ };
}
```

CLI 增加 `--read-only` 与交互命令 `/tools`，调用 `listTools()` 遍历注册表即可。

## 运行验证

```bash
cd agents/s12-tool-registry
cp .env.example .env
npx tsx src/cli.ts --read-only
# 交互式里输入 /tools 查看当前可用工具列表
```

对比去掉 `--read-only` 时列表是否包含写类工具。

## 对照 Claude Code

| 方面 | 教学版 | Claude Code |
|------|--------|-------------|
| 组装 | `assembleToolPool` | `tools.ts` 中类似组装，规模更大 |
| 条件加载 | 只读过滤 | 权限模式、延迟加载、ToolSearch 等 |
| 排序 | 显式数组 | 同样强调稳定顺序与缓存 |

生产注册表还常见：**分组**（读/写/危险）、**动态子集**、与 query 层协作。

## 深入思考

1. **过滤后 `get(name)` 应查哪张表？** 应对外只暴露「当前启用」的工具，避免模型拿到未注入 schema 的名称。  
2. **新工具默认插在什么位置？** 约定「同类聚集」或「字母序」均可，关键是**可重复、可审查**。  
3. **与 s08 `toolMap` 关系**：注册表是其在多工具、多模式下的系统化延伸。

## 练习

1. 在 `assembleToolPool` 增加按名称排序的 **debug 开关**，对比开启前后 API cache 行为（需结合日志或指标）。  
2. 实现 `registry.validate()`：检查 `name` 唯一、`toApiTools()` 与 `getAll()` 长度一致。  
3. 浏览 Claude Code `tools.ts`，列出三种「条件注册」工具的场景。
