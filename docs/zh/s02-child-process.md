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
| `child_process.exec` | API 简单，直接返回字符串 | 输出缓冲在内存，大输出会 <abbr data-tip="Out of Memory，内存耗尽。当程序使用的内存超过系统限制时，操作系统会强制终止进程。exec 默认缓冲上限是 1MB，超过就报错。">OOM</abbr> |
| `child_process.spawn` | 流式输出，可控性强 | 需要自己拼接输出 |

**Claude Code 选择了 spawn**，因为工具的输出可能非常大（比如 `cat` 一个大文件），`exec` 会把全部输出缓冲在内存里，而 `spawn` 的流式处理可以在输出超过限制时主动截断。

### 安全策略

我们在这一课实现最基础的正则匹配拦截。后面的 s32-s34 课会引入完整的权限系统。

现阶段的策略：
1. **执行前拦截**：用正则检查命令是否匹配危险模式
2. **超时控制**：默认 30 秒，超时则 <abbr data-tip="Unix 信号。SIGTERM（信号 15）是「请优雅退出」，进程可以捕获它做清理；SIGKILL（信号 9）是「强制终止」，进程无法忽略或捕获。">SIGTERM</abbr> 然后 <abbr data-tip="Unix 信号。SIGTERM（信号 15）是「请优雅退出」，进程可以捕获它做清理；SIGKILL（信号 9）是「强制终止」，进程无法忽略或捕获。">SIGKILL</abbr>
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

核心设计——安全检查 → <abbr data-tip="Node.js 内置的子进程方法。spawn 启动一个新进程并返回流式接口，适合执行长命令或输出量大的命令。相比 exec，spawn 不会把全部输出缓冲在内存里。">spawn</abbr> 执行 → 超时控制 → 输出限制：

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
3. **两阶段 kill**：<abbr data-tip="Unix 信号。SIGTERM（信号 15）是「请优雅退出」，进程可以捕获它做清理；SIGKILL（信号 9）是「强制终止」，进程无法忽略或捕获。">SIGTERM</abbr> 给进程清理机会，3 秒后 SIGKILL 强制终止

> 完整实现见 **源码** 标签页的 `shell.ts`

### 步骤 3: 添加 exec 子命令

在 CLI 中注册 `exec <command>` 子命令，接收 `--timeout` 参数：

```typescript
program
  .command("exec <command>")
  .description("执行 shell 命令")
  .option("-t, --timeout <ms>", "超时时间（毫秒）", "30000")
  .action(async (command, options) => {
    const result = await execShell(command, {
      timeout: Number(options.timeout),
    });
    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    process.exit(result.exitCode);
  });
```

注意 `exec` 和前面 `chat` 子命令的用法不同——这里直接调用 `shell.ts`，不经过 AI API。

> 完整代码见 **源码** 标签页的 `cli.ts`

> 这一课我们只封装了 `shell.ts` 模块，还没有和 AI 对接。`main.ts` 的对话逻辑暂时和 s01 一样。下一课 s03 会把 shell 执行接到 Agent 循环里——那才是真正的 Agent。

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

**Q: `spawn("sh", ["-c", command])` 为什么不直接 `spawn(command)`？**

A: 因为很多命令需要 shell 特性——管道 `|`、通配符 `*`、环境变量 `$HOME`、重定向 `>` 等。`spawn("sh", ["-c", command])` 通过 shell 解释器执行命令，天然支持这些语法。直接 `spawn(command)` 只能执行单个程序，`ls -la | grep foo` 这样的管道命令就无法运行。

## 练习

给 `execShell` 函数添加一个 `onOutput` 回调，在命令执行过程中实时输出每一行，而不是等全部结束后才打印：

```typescript
await execShell("ping -c 5 google.com", {
  onOutput: (line) => console.log(`> ${line}`),
});
```

提示：在 `child.stdout.on("data", ...)` 里按行分割数据。

<details>
<summary>参考实现</summary>

修改 `ShellResult` 接口和 `execShell` 函数签名，增加 `onOutput` 回调参数：

```typescript
export interface ShellOptions {
  timeout?: number;
  maxOutput?: number;
  cwd?: string;
  onOutput?: (line: string) => void;  // 新增
}

export async function execShell(
  command: string,
  options: ShellOptions = {}
): Promise<ShellResult> {
  // ... 安全检查不变 ...

  // 流式输出部分改为逐行回调
  let buffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    if (stdout.length >= maxOutput) return;
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop()!;  // 保留未完成的行
    for (const line of lines) {
      if (options.onOutput) options.onOutput(line);
      stdout += line + "\n";
    }
  });

  // close 事件中处理 buffer 残余
  child.on("close", (code) => {
    if (buffer && options.onOutput) options.onOutput(buffer);
    stdout += buffer;
    // ... 后续截断逻辑不变 ...
  });
}
```

**要点**：
- 流式数据到达时不是完整的一行，需要用 `buffer` 拼接，按 `\n` 分割
- `lines.pop()` 保留最后一个可能不完整的行，等下次 data 事件继续拼接
- `close` 事件中要处理 buffer 里最后残余的数据

</details>

## 下一课预告

下一课 **s03 Agent Loop** 是整个课程的"转折点"——我们将把 s00 的 API 调用和 s02 的命令执行通过一个 `while` 循环连接起来。那个循环，就是 AI Agent 的全部秘密。
