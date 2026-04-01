# s09 — 文件工具：FileRead + FileWrite

## 问题场景

仅靠 `bash` 读写文件，模型容易写出冗长、易错的 shell；且难以统一做路径校验与输出格式。  
我们需要**一等公民的文件工具**：读要利于「按行引用」，写要安全、可重复。

**矛盾点**：既要方便模型理解（行号、元信息），又要在多租户/沙箱思路下**禁止目录穿越**。

## 设计决策

### FileRead：带行号、可分页

- 输出包含**行号**，便于后续 `file_edit` 精确定位。  
- 支持 `offset` / `limit`，避免一次把巨文件塞进上下文。  
- 区分「文件不存在」「路径是目录」等错误，返回 `is_error`，便于模型自纠。

### FileWrite：自动建目录、明确语义

- `mkdir -p` 等价行为：父目录不存在则递归创建。  
- 覆盖写与新建用返回文案区分（如「已覆盖」「已创建」），方便日志与人类阅读。

### 路径安全：防目录穿越

解析路径后要求落在 `cwd` 之下（`resolve` 后以 `cwd` 为前缀校验），拒绝 `../` 等逃逸。

## 实现要点

### 路径校验

**校验**（与仓库中 `file-read.ts` / `file-write.ts` 一致）：

```typescript
function validatePath(filePath: string, cwd: string): string | null {
  const resolved = path.resolve(cwd, filePath);
  if (!resolved.startsWith(cwd)) {
    return "路径越权：不允许访问工作目录之外的文件";
  }
  return null;
}
```

先校验再 `stat` / 读写，避免把非法路径泄露进文件系统错误信息。

### FileRead 流水线

1. `path.resolve(cwd, filePath)`，再检查存在性与「不是目录」。  
2. `readFileSync(..., "utf-8")`，`split("\n")` 得到全部行。  
3. `offset` 为 1-based 时，内部转成从 0 开始的切片下标；`limit` 存在则 `slice(offset, offset + limit)`。  
4. `addLineNumbers`：根据总行数决定左侧行号宽度，输出 `行号|内容` 形式。  
5. 首行元信息：`[绝对或解析路径] N lines total`，再接编号正文。

### FileWrite 流水线

1. 同样先 `validatePath`。  
2. `path.dirname(resolved)` → `mkdirSync(dir, { recursive: true })`。  
3. 记录目标是否已存在，再 `writeFileSync`，返回「已创建 / 已覆盖」与行数统计。

## 运行验证

```bash
cd agents/s09-file-tools
cp .env.example .env
npx tsx src/cli.ts "请读取 package.json 的前 20 行并总结 name 字段"
```

可再试：在工作区外路径写入，应得到越权错误信息。

## 对照 Claude Code

| 能力 | 教学版 (s09) | Claude Code |
|------|----------------|-------------|
| 文本读取 | 行号 + offset/limit | 同上，并强化大文件策略 |
| 写入 | 递归建目录、覆盖写 | 另含 diff 预览、undo 快照、权限流 |
| 二进制 / 媒体 | 未专门处理 | `FileReadTool` 等对图片 base64、PDF、二进制检测 |

我们刻意保持读写在**纯文本**路径上简单可靠；生产版再叠预览、权限与多媒体。

## 深入思考

1. **`startsWith(cwd)` 的漏洞**：在 Windows 大小写、尾部分隔符或符号链接下，`resolve` 结果可能仍「看起来」在 cwd 外或内；生产环境应对 cwd 与 resolved 做同一套规范化（如 `realpath`）再比较。  
2. **为什么默认 utf-8？** 与模型交互以文本为主；二进制若误读会产生乱码并污染上下文，不如明确拒绝或走专用工具。  
3. **读工具标 `isReadOnly: true`**：为 s12 只读模式与权限分层做准备，搜索类工具同理。  
4. **错误用 `is_error: true` 返回**：与 s05 消息管理衔接——模型可把失败当作下一轮修正的输入，而不是静默成功。

## 练习

1. 为 `file_read` 增加可选 `encoding` 参数（默认 `utf-8`），并文档化失败行为。  
2. 在写入前检查目标路径是否已存在且为目录，返回明确错误。  
3. 对照 Claude Code `FileReadTool` / `FileWriteTool`，列出三项「下一阶段可加的」生产特性（如快照、diff、大小上限），不必实现。  
4. 手写两个路径用例：`foo/../../../etc/passwd` 与 cwd 内正常相对路径，说明校验分别应怎样表现。
