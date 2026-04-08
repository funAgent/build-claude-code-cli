# s02 — 子进程与安全执行

> **An agent needs hands — child_process is the first pair**

`[ Phase 0: 预备知识 ]` · 工具数: 0 · 代码量: ~80 行

---

## 前置知识

- 需要完成: s01 [CLI 脚手架]

## 你将学到

- Node.js `child_process.spawn` 的正确用法
- 为什么用 `spawn` 而不是 `exec`
- 如何实现超时控制、输出大小限制
- 危险命令拦截的基本策略
- 为什么安全检查必须在执行前而不是执行后

## 问题场景

到目前为止，你的 CLI 只能"说话"——问它问题，它给你文字回答。但一个真正的 AI Agent 需要能"动手"：

- 用户说"帮我看看当前目录有什么文件" → Agent 需要执行 `ls -la`
- 用户说"帮我创建一个 React 项目" → Agent 需要执行 `npx create-react-app`
- 用户说"帮我跑一下测试" → Agent 需要执行 `npm test`

这些都依赖一个能力：**安全地执行 shell 命令**。

但执行 shell 命令是危险的。如果 AI 模型被诱导执行 `rm -rf /`，后果不堪设想。所以在给 Agent 这双"手"的同时，必须同时给它"手套"——安全检查。

## 设计决策

### spawn vs exec

| 方案 | 优点 | 缺点 |
|------|------|------|
| `child_process.exec` | API 简单，直接返回字符串 | 输出缓冲在内存，大输出会 OOM |
| `child_process.spawn` | 流式输出，可控性强 | 需要自己拼接输出 |

**Claude Code 选择了 spawn**，因为工具的输出可能非常大（比如 `cat` 一个大文件），`exec` 会把全部输出缓冲在内存里，而 `spawn` 的流式处理可以在输出超过限制时主动截断。

### 安全策略

我们在这一课实现最基础的正则匹配拦截。后面的 s32-s34 课会引入完整的权限系统。

现阶段的策略：
1. **执行前拦截**：用正则检查命令是否匹配危险模式
2. **超时控制**：默认 30 秒，超时则 SIGTERM 然后 SIGKILL
3. **输出限制**：stdout/stderr 各最多 1MB，超过则截断

## 动手实现

### 步骤 1: 危险命令检测

用正则数组匹配 `rm -rf /`、`mkfs`、`dd of=/dev/` 等危险模式。关键原则：**安全检查在执行前，不是执行后**。一旦 `rm -rf /` 开始执行，再拦截就来不及了。

```typescript
export function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) return `命令匹配危险模式: ${pattern.source}`;
  }
  return null;
}
```

> 完整的危险模式列表见 **源码** 标签页

### 步骤 2: spawn 封装

核心设计——安全检查 → spawn 执行 → 超时控制 → 输出限制：

```typescript
export async function execShell(command: string, options = {}): Promise<ShellResult> {
  const danger = isDangerous(command);
  if (danger) return { stdout: "", stderr: `[安全拦截] ${danger}`, exitCode: 1 };

  const child = spawn("sh", ["-c", command], {
    cwd, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"],
  });
  // 超时：先 SIGTERM，3 秒后 SIGKILL
  // 输出：流式收集，超过 maxOutput 截断
}
```

三个关键设计点：
1. `spawn("sh", ["-c", command])` — 通过 shell 执行，支持管道、通配符
2. `stdio: ["ignore", "pipe", "pipe"]` — 不接受 stdin，捕获 stdout/stderr
3. **两阶段 kill**：SIGTERM 给进程清理机会，3 秒后 SIGKILL 强制终止

> 完整实现见 **源码** 标签页的 `shell.ts`

### 步骤 3: 添加 exec 子命令

在 CLI 中注册 `exec <command>` 子命令，接收 `--timeout` 参数。

> 完整代码见 **源码** 标签页的 `cli.ts`

## 运行验证

```bash
npm run dev -- exec "ls -la"          # 正常命令
npm run dev -- exec "rm -rf /"        # 被拦截
npm run dev -- exec "sleep 60" -t 3000  # 超时
```

> 点击 **模拟器** 标签页查看安全拦截和超时控制的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| 命令执行 | `spawn("sh", ["-c", cmd])` | `spawn("bash", ["-c", cmd])` |
| 安全检查 | 正则匹配 | 多层：正则 + AI 分类器 + 权限系统 |
| 超时 | SIGTERM → SIGKILL | 同样的两阶段 kill |
| 输出限制 | 1MB 截断 | token 预算 + 磁盘替换 |

> 更详细的架构对照见 **深入** 标签页

## 深入思考

**Q: 为什么正则匹配不足以保证安全？**

A: 正则只能匹配已知的危险模式。攻击者可以用编码、变量替换、别名等方式绕过。比如 `rm -rf $(echo /)` 就绕过了直接的 `rm -rf /` 检测。所以 Claude Code 使用多层防御：正则是第一道快速检查，后面还有 AI 分类器和交互式权限确认。

**Q: 为什么 Claude Code 用 bash 而我们用 sh？**

A: `bash` 功能更丰富（数组、高级字符串操作等），但不是所有系统都有 bash（比如某些 Docker 镜像）。教学阶段用 `sh` 兼容性更好。实际产品中，Claude Code 会先检测用户的 shell 环境，优先使用 bash。

## 动手练习

给 `execShell` 函数添加一个 `onOutput` 回调，在命令执行过程中实时输出每一行，而不是等全部结束后才打印：

```typescript
await execShell("ping -c 5 google.com", {
  onOutput: (line) => console.log(`> ${line}`),
});
```

提示：在 `child.stdout.on("data", ...)` 里按行分割数据。

## 下一课预告

下一课 **s03 Agent Loop** 是整个课程的"转折点"——我们将把 s00 的 API 调用和 s02 的命令执行通过一个 `while` 循环连接起来。那个循环，就是 AI Agent 的全部秘密。
