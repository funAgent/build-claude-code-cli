# 贡献指南

感谢你对 Build Claude Code 项目的关注！本文档说明如何修改现有课程内容、添加新知识内容，以及如何确保课程之间的一致性。

## 目录

- [项目架构概览](#项目架构概览)
- [修改现有课程](#修改现有课程)
- [添加新课程](#添加新课程)
- [课程间的依赖关系](#课程间的依赖关系)
- [一致性校验](#一致性校验)
- [开发工作流](#开发工作流)
- [提交规范](#提交规范)

---

## 项目架构概览

每节课由以下文件组成：

```
课程 sXX 的完整文件清单：

agents/sXX-lesson-name/
└── src/
    └── *.ts                    # 源码实现（可独立运行）

docs/
├── zh/sXX-lesson-name.md      # 中文教学文档
└── en/sXX-lesson-name.md      # 英文教学文档

web/src/data/
├── scenarios/sXX.json          # Agent Loop 模拟器场景数据
├── annotations/sXX.json        # 架构注解数据
└── terminal-recordings/sXX.json # 终端录制数据

web/src/lib/constants.ts        # VERSION_META 中该课的元数据条目
```

### 文件间关系图

```
constants.ts (VERSION_META)
    ↓ 元数据（标题、描述、prevVersion、loc）
    ↓
extract-content.ts (构建时执行)
    ↓ 读取 agents/sXX/src/*.ts → 生成 versions.json
    ↓ 读取 docs/zh/sXX-*.md → 生成 docs.json
    ↓
web/src/data/generated/
├── versions.json    → SourceViewer 使用（源码展示 + Diff 对比）
└── docs.json        → DocRenderer 使用（教学文档渲染）
```

---

## 修改现有课程

### 场景一：只修改教学文档

修改 `docs/zh/sXX-*.md` 的文字内容（修正错别字、优化表述、补充解释等）。

**影响范围：仅当前课程。** 教学文档彼此独立，不影响其他课程。

```bash
# 示例：修改 s06 的教学文档
vim docs/zh/s06-configuration.md

# 验证
cd web && npm run build
```

### 场景二：修改课程源码

修改 `agents/sXX-*/src/*.ts` 中的实现代码。

> **这是影响范围最大的修改类型。** 请仔细阅读下方 [课程间的依赖关系](#课程间的依赖关系)。

**步骤：**

1. 修改目标课程的源码
2. 运行同步脚本自动传播改动到后续课程
3. 运行一致性校验确认全部通过

```bash
# 示例：修改 s06 的源码
vim agents/s06-configuration/src/config.ts

# 先预览会传播到哪些课程（不实际修改）
npm run sync -- s06 --dry-run

# 确认无误后，实际执行同步
npm run sync -- s06

# 验证一致性
npm run check -- --from s06
cd web && npm run build
```

**同步脚本的工作原理：**

1. 通过 `git diff` 获取你在 sXX 中的改动（old → new）
2. 在后续每个课程的同名文件中搜索 old 文本
3. 找到则自动替换为 new 文本
4. 找不到则跳过（该课可能已重写这部分，需手动处理）

脚本使用三层匹配策略：
- **精确匹配**（含上下文）— 最安全
- **空格容差匹配** — 处理行尾空格差异
- **无上下文匹配**（仅变更行）— 处理周围代码已变化的情况

### 场景三：修改网站配套数据

修改 `web/src/data/` 下的 JSON 文件。

**影响范围：仅当前课程。** 场景、注解、终端录制数据彼此独立。

注意 JSON 文件必须符合对应的 TypeScript 接口，参考已有文件的结构。

### 场景四：修改 VERSION_META 元数据

修改 `web/src/lib/constants.ts` 中的课程元数据。

**注意：** `loc` 字段应与 `agents/sXX/src/` 中的实际代码行数对应（通过 `extract-content.ts` 自动计算）。`prevVersion` 字段表示上一课的 ID，不要随意修改（会影响 Diff 对比）。

---

## 添加新课程

1. **创建源码目录：**

```bash
mkdir -p agents/sXX-lesson-name/src
# 编写源码文件
```

2. **创建教学文档：**

```bash
# 中文文档（必需）
touch docs/zh/sXX-lesson-name.md

# 英文文档（可选）
touch docs/en/sXX-lesson-name.md
```

3. **创建网站数据文件：**

```bash
# 复制模板
cp web/src/data/scenarios/s00.json web/src/data/scenarios/sXX.json
cp web/src/data/annotations/s00.json web/src/data/annotations/sXX.json
cp web/src/data/terminal-recordings/s00.json web/src/data/terminal-recordings/sXX.json

# 编辑每个文件，填入新课程内容
```

4. **注册到 constants.ts：**

在 `VERSION_META` 中添加新条目，在 `VERSION_ORDER` 中添加 ID，在对应的 Phase 的 `sessions` 数组中添加。

5. **注册动态导入：**

在以下组件中添加新课程的动态导入映射：

- `web/src/components/terminal/terminal-player.tsx`
- `web/src/components/deep-dive/annotation-viewer.tsx`
- `web/src/components/simulator/agent-loop-simulator.tsx`

6. **验证：**

```bash
node scripts/check-consistency.mjs
cd web && npm run build
```

---

## 课程间的依赖关系

这是本项目最重要的架构约束。理解这个关系，才能安全地修改课程内容。

### 源码的递增关系

课程源码是**递增构建**的。每一课在上一课的基础上添加新代码：

```
s03 (agent-loop.ts)           ← 基础 Agent 循环
  ↓ s04 新增 message-manager.ts, 修改 agent-loop.ts
s04 (agent-loop.ts + message-manager.ts)
  ↓ s05 新增 error-handler.ts, 修改 agent-loop.ts
s05 (agent-loop.ts + message-manager.ts + error-handler.ts)
  ...
```

### 修改某课源码时的连锁影响

当你修改 `s06` 的某个函数签名时：

| 被影响的内容 | 是否需要更新 | 原因 |
|-------------|-------------|------|
| s07 及之后的源码 | **是** | 后续课程的代码可能引用了 s06 修改的函数/接口 |
| s07 的 Diff 对比 | **自动** | SourceViewer 会自动重新计算 s07 vs s06 的 diff |
| s06 的教学文档 | 看情况 | 如果文档引用了修改的代码片段，需要同步更新 |
| s06 的场景/注解/录制 | 看情况 | 如果这些数据引用了具体代码，需要更新 |

### 哪些修改是安全的（不影响后续课程）

- **纯注释修改**：只改注释内容，不改函数签名和行为
- **内部实现修改**：不改变导出的接口，只改内部逻辑
- **新增独立文件**：添加新文件且后续课程不引用它

### 哪些修改是危险的（可能影响后续课程）

- **修改导出的函数/接口签名**
- **重命名文件**
- **删除或合并文件**
- **修改核心数据结构**

### 实际示例

假设你要修改 `s06-configuration` 中的配置加载函数：

```typescript
// 修改前 (s06)
export function loadConfig(): Config {
  // ...
}

// 修改后 (s06) — 添加了参数
export function loadConfig(projectDir?: string): Config {
  // ...
}
```

**需要检查的后续课程：**

```bash
# 搜索哪些后续课程调用了 loadConfig
cd agents
grep -r "loadConfig" s07-*/src/ s08-*/src/ s09-*/src/ ...
```

如果 `s07` 到 `s12` 都调用了 `loadConfig()`，由于新签名是兼容的（参数可选），所以这些课程的源码不需要修改。但如果你把参数改成了必填，就需要逐课更新。

---

## 一致性校验

项目提供了一个校验脚本来确保课程间的一致性。

### 运行校验

```bash
# 校验所有课程
node scripts/check-consistency.mjs

# 只校验某课及其之后的课程
node scripts/check-consistency.mjs --from s06

# 输出详细信息
node scripts/check-consistency.mjs --verbose
```

### 校验项目

| 检查项 | 说明 |
|--------|------|
| 文件完整性 | 每课是否有完整的源码、文档、场景、注解、录制文件 |
| VERSION_META 对齐 | constants.ts 中的 loc 是否与实际源码行数接近 |
| prevVersion 链 | VERSION_META 中的 prevVersion 是否形成正确的链 |
| 源码递增性 | 后一课的文件集合是否包含前一课的文件（新增或保留） |
| 动态导入注册 | 三个组件中是否注册了所有课程的动态导入 |

### Pre-commit 集成

项目配置了 pre-commit hook，在提交前自动运行校验：

```bash
# 首次设置（安装 git hook）
npm run setup-hooks

# 之后每次 git commit 时会自动运行：
# 1. check-consistency.mjs — 课程一致性校验
# 2. 如果校验失败，会提示你运行哪些命令来修复
```

---

## 开发工作流

### 日常修改流程

```bash
# 1. 修改内容
vim agents/sXX-*/src/*.ts
vim docs/zh/sXX-*.md

# 2. 如果修改了源码，先同步到后续课程
npm run sync -- sXX --dry-run   # 先预览
npm run sync -- sXX             # 确认后执行

# 3. 运行一致性校验
npm run check

# 4. 本地预览
cd web && npm run dev

# 5. 构建验证
cd web && npm run build

# 6. 提交（pre-commit hook 会自动运行校验）
git add .
git commit
```

### 推荐的编辑器设置

- 使用支持 TypeScript 的编辑器（VS Code / Cursor）
- 安装 ESLint 和 Prettier 插件
- 打开 `agents/` 和 `web/` 目录时分别关注不同的 tsconfig

---

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat(s06): 添加项目目录配置支持
fix(s12): 修复工具注册表排序不稳定的问题
docs(s06): 修正配置优先级描述
chore(web): 更新 tailwind 配置
```

**scope 规则：**

- `sXX` — 修改特定课程
- `web` — 修改教学网站
- `scripts` — 修改构建/校验脚本
- 无 scope — 项目级别修改
