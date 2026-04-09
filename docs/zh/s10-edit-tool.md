# s10 — 编辑工具：精确替换 vs 整文件覆写

> **Don't send the whole file when you only changed one line**

`[ Phase 2: 工具系统 ]` · 工具数: 4 · 代码量: ~200 行

---

## 前置知识

- 需要完成: s09 [文件工具]

## 你将学到

- `file_edit` 工具：old_string → new_string 精确替换模式
- 唯一性约束——避免歧义替换
- 错误反馈设计——让模型自己修正
- 与 `file_write` 的分工策略

## 问题场景

用 `file_write` 改一行代码，往往要把**整个文件**再发给模型一遍：token 贵、上下文噪声大，且容易无意覆盖无关内容。

**目标**：在「已读过文件」的前提下，用**局部补丁式**修改，让模型只描述变更 <abbr data-tip="Delta，即「差异」或「增量」。在版本控制中，delta 表示两个版本之间的变化量。file_edit 只发送变化的部分，而不是整个文件。">delta</abbr>。

## 设计决策

### old_string → new_string 模式

三个参数：`path`、`old_string`、`new_string`。语义是：在文件内容中查找 `old_string`，替换为 `new_string` **一次**。

### 唯一性约束

`old_string` 必须在文件中**恰好出现一次**：

- 0 次 → 返回错误，并附上文件前几行带行号的预览，帮助模型修正上下文。
- 多于 1 次 → 报错说明次数，提示「增加上下文使片段唯一」。

这样把「歧义」变成可消费的 `tool_result`，驱动模型自校正。

### 与 file_write 的分工

| 场景 | 推荐 |
|------|------|
| 新建小文件 | `file_write` |
| 改一处实现、一处配置 | `file_edit` |
| 大规模格式化 / 全文件生成 | `file_write` 或专用格式化工具 |

## 实现要点

核心步骤：路径校验（同 s09）→ 读全文 → `split(oldStr).length - 1` 计数 → 唯一则 `replace` 一次写回。

```typescript
const count = content.split(oldStr).length - 1;
if (count === 0) { /* 附预览，is_error */ }
if (count > 1) { /* 报告次数，is_error */ }
const updated = content.replace(oldStr, newStr);
```

注意：`split` 计数对「空字符串」等边界需单独规定（教学实现可禁止 `old_string` 为空）。

### 错误反馈设计

- **未找到**：附带「前 N 行」带行号预览，缩短模型猜测轮数。
- **多次匹配**：明确写出出现次数，提示增加前后文（注释、签名）使片段唯一。

返回信息可包含替换前后行数差（`oldStr` / `newStr` 各自按 `\n` 分行计数），便于日志与人类扫一眼确认「改动体量」。

## 运行验证

```bash
cd agents/s10-edit-tool
npm install
cp .env.example .env
npm run dev "把 src/cli.ts 里的版本号字符串改成一个明显的新版本（用 file_edit）"
```

人工检查：仅应改动目标片段，而非整文件重写。

## 对照 Claude Code

| 方面 | 教学版 | Claude Code `FileEditTool` |
|------|--------|---------------------------|
| 替换模型 | 单次 `old_string`/`new_string` | 同类思路，附加产品化能力 |
| 错误反馈 | 次数 + 行预览 | 更丰富的 diff / 用户确认 |
| 权限与审计 | 最小实现 | 权限、历史、撤销链 |

核心思想一致：**结构化编辑 + 可恢复的错误反馈**；差异主要在工程与 UX 厚度。

## 深入思考

1. **为何不用行号范围替换？** 行号会随编辑漂移；**内容锚点**更稳，但仍需唯一性。
2. **「约 90% token 节省」从何而来？** 相对把整文件当 `file_write` 的 `content` 输入；实际比例随文件大小变化。
3. **多文件同一编辑**：应多次 `tool_use` 还是批处理？涉及事务性与失败回滚，课程后续可扩展。

## 练习

1. 当 `old_string` 唯一但跨多行时，验证当前实现行为并写一条单元测试。
2. 设计「若出现 2 次则返回两处行号」的错误格式，是否更有利于模型？
3. 阅读 Claude Code 中 `FileEditTool` 的 diff 展示逻辑，写三点可借鉴之处。

<details>
<summary>练习 2 参考思路</summary>

当 `old_string` 出现多次时，返回所有匹配位置的行号：

```typescript
if (count > 1) {
  const lines = content.split("\n");
  const matchLines: number[] = [];
  let searchFrom = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = lines.slice(0, i).join("\n").length + (i > 0 ? 1 : 0);
    if (content.indexOf(oldStr, lineStart) !== -1 &&
        content.indexOf(oldStr, lineStart) < lineStart + lines[i].length + 1) {
      matchLines.push(i + 1);
    }
  }
  return {
    output: `old_string 在文件中出现 ${count} 次，位置: 第 ${matchLines.join(", ")} 行。` +
            `请增加更多上下文（如前后几行代码）使其唯一。`,
    exitCode: 1,
  };
}
```

**好处**：模型知道具体在哪里出现，可以选择加上行号附近的代码作为上下文，比单纯说"出现多次"更利于自修正。

</details>

## 下一课预告

Agent 不知道仓库里有哪些文件、某符号在哪里出现时，只能盲目搜索。下一课 **s11 搜索工具** 将实现 glob 和 grep，补齐「先找再改」的工具链。
