# s06 — 配置管理

> **Never hardcode what might change**

`[ Phase 1: 最小 Agent ]` · 工具数: 1 · 代码量: ~200 行

---

## 前置知识

- 需要完成: s05 [错误处理]

## 你将学到

- 多层配置优先级链的设计原则
- 配置优先级：CLI 参数 > 环境变量 > 项目配置 > 全局配置 > 默认值
- 如何在 Node.js 中实现配置文件的向上查找
- 为什么"不硬编码"是工程的基本纪律

## 问题场景

到 s05 为止，Agent 的所有参数都是硬编码的：
- 模型名 `claude-sonnet-4-20250514` 写死在代码里
- 最大轮次 `10` 写死在代码里
- 超时时间 `30000` 写死在代码里

不同用户、不同项目需要不同的配置。前端开发者可能想用便宜的模型快速迭代，后端开发者可能需要更长的超时时间。

## 设计决策

### 配置优先级链

```
CLI 参数  →  环境变量  →  项目配置  →  全局配置  →  默认值
 (最高)                                              (最低)
```

每一层可以覆盖下一层的部分值。这和 CSS 的级联原理完全一样。

### 项目配置的向上查找

从当前目录开始向上查找 `.mycli.json`，直到根目录。这样在子目录运行时也能找到项目根的配置。

## 动手实现

### 步骤 1: 配置优先级合并

用对象扩展运算符，后者覆盖前者：

```typescript
function loadConfig(cliOverrides = {}): AppConfig {
  return {
    ...DEFAULTS,       // 最低优先级
    ...globalConfig,   // ~/.mycli/config.json
    ...projectConfig,  // .mycli.json（向上查找）
    ...envConfig,      // MYCLI_MODEL 等环境变量
    ...cliOverrides,   // --model 等 CLI 参数（最高优先级）
  };
}
```

> 完整实现见 **源码** 标签页

## 运行验证

```bash
npm run dev                              # 使用默认配置
npm run dev -- --model claude-haiku-4-20250514  # CLI 覆盖模型
MYCLI_MAX_TURNS=5 npm run dev            # 环境变量覆盖轮次
npm run dev                              # 交互式，输入 /config 查看
```

> 点击 **模拟器** 标签页查看配置加载流程的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| 配置层级 | 4 层（CLI/env/project/global） | 5+ 层（含 session/feature flag） |
| 项目配置 | `.mycli.json` | `CLAUDE.md` 三级加载 |
| 向上查找 | 简单 while 循环 | 同 + git root 限制 |
| 验证 | 无 | JSON Schema 校验 |

> 更详细的架构对照见 **深入** 标签页

## 深入思考

**Q: 为什么 Claude Code 用 CLAUDE.md 而不是 JSON？**

A: CLAUDE.md 是 Markdown 格式，对用户更友好——可以写注释、用标题分组、支持自然语言描述。JSON 适合程序解析，Markdown 适合人写人读。Claude Code 两者都用：`settings.json` 给程序用，`CLAUDE.md` 给人写。

## 动手练习

1. 实现 `/config set model claude-haiku-4-20250514` 命令，运行时修改配置
2. 添加配置验证：model 必须是已知的模型名，maxTurns 必须在 1-100 之间
3. 实现配置来源追踪：每个配置项标注它来自哪一层（default/global/project/env/cli）

## 下一课预告

Agent 跑起来了，但你知道每次对话花了多少钱吗？下一课 **s07 成本追踪** 将添加实时 token 计数和成本显示。
