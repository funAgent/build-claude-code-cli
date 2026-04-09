# s01 — CLI 脚手架

> **Every product starts with npm init and a bin field**

`[ Phase 0: 预备知识 ]` · 工具数: 0 · 代码量: ~100 行

---

## 前置知识

- 需要完成: s00 [AI API 入门]

## 你将学到

- 用 Commander.js 构建 CLI 命令和参数解析
- `package.json` 的 `bin` 字段如何让代码变成可执行命令
- 入口文件（cli.ts）和业务逻辑（main.ts）的分离原则
- 用 esbuild 将 TypeScript 打包成单文件

## 问题场景

s00 里你写了一个 `index.ts` 跑着还行，但存在两个问题：

1. **启动方式不专业**：每次都要 `npx tsx src/index.ts`，而不是像 Claude Code 那样输入 `claude` 就能启动
2. **没有参数解析**：想换模型？改代码。想加 system prompt？改代码。所有配置都硬编码

一个 CLI 产品需要：`mycli chat --model xxx --system "你是专家"` 这样的命令行体验。

## 设计决策

| 方案 | 优点 | 缺点 |
|------|------|------|
| A: 手写 process.argv 解析 | 零依赖 | 不支持子命令、帮助文本要手写 |
| B: Commander.js | 子命令、帮助、版本号、选项验证一站式 | 多一个依赖 |
| C: yargs | 功能更丰富 | API 更复杂，包体积更大 |

**Claude Code 选择了 Commander.js**，因为它轻量、API 直觉、支持子命令嵌套，而且在 Node.js CLI 生态中市场份额最大。

## 动手实现

### 步骤 1: 创建 CLI 入口

CLI 入口只负责参数解析，不包含业务逻辑：

```typescript
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program.name("mycli").version("0.1.0");

program
  .command("chat")
  .option("-m, --model <model>", "模型名称", "claude-sonnet-4-20250514")
  .action(async (options) => {
    await startChat({ model: options.model });
  });
```

注意第一行 `#!/usr/bin/env node` 是 <abbr data-tip="脚本第一行的 #! 指令，告诉操作系统用哪个程序来执行这个文件。env node 会自动在 PATH 中找到 node，比硬编码路径更通用。">shebang</abbr>，让操作系统知道用 node 来执行。

> 完整代码见 **源码** 标签页的 `cli.ts`

除了 `chat` 子命令，还提供了 `ask` 子命令用于单次提问，不需要进入交互循环：

```bash
mycli ask "什么是 TypeScript？" -m claude-sonnet-4-20250514
```

适合在脚本中快速调用 AI，或者在 CI/CD 中做批量处理。

### 步骤 2: 分离业务逻辑到 main.ts

```typescript
export async function startChat(options: ChatOptions): Promise<void> {
  // 对话循环逻辑
}
```

为什么要分离？因为 `main.ts` 可以被其他模块导入（比如测试、SDK），而 `cli.ts` 只是一个入口壳。Claude Code 也是这么做的：`cli.tsx` 极薄，`main.tsx` 厚。

> 完整代码见 **源码** 标签页的 `main.ts`

### 步骤 3: 配置 bin 字段和 esbuild 打包

```json
{ "bin": { "mycli": "./dist/cli.mjs" } }
```

<abbr data-tip="package.json 中的 bin 字段定义了 npm 包安装后会在 node_modules/.bin/ 下创建的可执行命令。npm link 后就能直接在终端输入命令名来运行。">`bin` 字段</abbr>让 npm 知道你的包提供了哪个可执行文件。

用 <abbr data-tip="一个极快的 JavaScript/TypeScript 打包工具，用 Go 语言编写。--bundle 模式能把多个源文件合并为单个输出文件，适合 CLI 分发。Claude Code 也使用 esbuild。">esbuild</abbr> 的 `--bundle` 把所有本地导入打包成一个文件，`--external` 保留外部依赖。

实际的构建命令如下：

```bash
npx esbuild src/cli.ts \
  --bundle --platform=node --format=esm \
  --external:@anthropic-ai/sdk --external:commander \
  --outfile=dist/cli.mjs
```

几个关键参数的解释：

| 参数 | 作用 |
|------|------|
| `--bundle` | 把 `cli.ts` 和 `main.ts` 等本地模块合并为一个文件 |
| `--platform=node` | 目标运行环境是 Node.js，保留 `__dirname` 等 Node 全局变量 |
| `--format=esm` | 输出 ESM 格式（`.mjs`），因为我们的源码用了 `import/export` |
| `--external:xxx` | 不把 `xxx` 包打进 bundle，运行时从 `node_modules` 加载 |

为什么 `@anthropic-ai/sdk` 要 `--external`？因为这些包体积大且包含平台相关的原生模块，打包进去反而容易出问题。CLI 产品安装后 `node_modules` 里已经有这些依赖了，直接引用即可。

## 运行验证

```bash
cd agents/s01-cli-scaffold
npm install
npm run dev -- chat
npm run dev -- --help
```

> 点击 **模拟器** 标签页查看终端运行效果的动画演示

## 对照 Claude Code 架构

| 概念 | 我们的实现 | Claude Code |
|------|-----------|-------------|
| CLI 入口 | `src/cli.ts` | `entrypoints/cli.tsx` |
| 核心逻辑 | `src/main.ts` | `main.tsx` |
| 参数解析 | Commander.js | Commander.js（同） |
| 打包工具 | esbuild | esbuild（同） |

> 更详细的架构对照见 **深入** 标签页

## 深入思考

**Q: 为什么 Claude Code 的 CLI 入口是 .tsx 而不是 .ts？**

A: 因为 Claude Code 的 TUI 使用了 React + Ink。`.tsx` 文件支持 JSX 语法，可以在 CLI 入口里直接渲染 React 组件。我们会在 s13 课引入 Ink 后也改为 `.tsx`。

**Q: bin 字段指向的文件需要被 git 跟踪吗？**

A: 开发阶段不需要——`dist/` 通常在 `.gitignore` 里。发布到 npm 时，`npm publish` 会自动包含 `bin` 指向的文件。

**Q: `npm run dev` 和 `npm link` 有什么区别？什么时候用哪个？**

A: `npm run dev` 通常对应 `npx tsx src/cli.ts`，直接用 TypeScript 执行器跑源码，修改后立刻生效，适合开发调试。`npm link` 会真正把命令注册到全局（在 `/usr/local/bin/` 下创建符号链接），让你在任何目录输入 `mycli` 来运行，体验和真实用户一致。开发阶段用 dev，发布前用 link 做最终验证。

## 练习

给你的 CLI 添加一个 `config` 子命令，输出当前使用的模型名称和 API Key 的前 8 位字符：

```bash
mycli config
# Model: claude-sonnet-4-20250514
# API Key: sk-ant-a3...
```

<details>
<summary>参考实现</summary>

在 `cli.ts` 中注册 `config` 子命令：

```typescript
program
  .command("config")
  .description("显示当前配置")
  .action(() => {
    const key = process.env.ANTHROPIC_API_KEY ?? "(未设置)";
    const masked = key.length > 8 ? key.slice(0, 8) + "..." : key;
    console.log(`Model: ${DEFAULT_MODEL}`);
    console.log(`API Key: ${masked}`);
  });
```

**要点**：
- 直接在 action 中读取环境变量，不需要调用 main.ts
- 对 API Key 做了脱敏处理，只显示前 8 位，避免在终端泄露完整密钥
- 这个命令不依赖 AI API，是纯本地操作，响应即时

</details>

## 下一课预告

下一课 **s02 子进程与安全执行** 将给 Agent 装上"手"——通过 `child_process` 执行 shell 命令。这是 Agent 能力的基础：能对话是不够的，还需要能操作文件系统。
