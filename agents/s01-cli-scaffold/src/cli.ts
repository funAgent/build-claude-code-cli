#!/usr/bin/env node

/**
 * s01 — CLI 入口
 *
 * Commander.js 解析命令行参数，
 * 提供 --version、--model、--prompt 等选项，
 * 然后调用 main.ts 中的核心逻辑。
 *
 * 对照 Claude Code: entrypoints/cli.tsx
 */

// Commander.js — Node.js 最流行的 CLI 框架，用来定义命令、解析参数、生成 --help
import { Command } from "commander";
// createRequire 让 ESM 模块也能用 CommonJS 的 require()，这里用来读取 JSON 文件
import { createRequire } from "node:module";
import { startChat } from "./main.js";

// ESM 中没有 require()，createRequire 基于当前文件路径创建一个兼容的 require 函数
const require = createRequire(import.meta.url);
// 读取 package.json 获取 version，这样 --version 会自动显示包的版本号，不用硬编码
const pkg = require("../package.json");

// ?? 是空值合并运算符：只有 null/undefined 时才取默认值，比 || 更安全（0、"" 不会被覆盖）
const DEFAULT_MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

const program = new Command();

// 全局配置：name 会出现在 --help 的首行，version 支持 --version / -V 参数
program
  .name("mycli")
  .description("AI Agent CLI — 从零构建")
  .version(pkg.version);

// 注册子命令：mycli chat
// .option() 定义可选参数，第三个参数是默认值
// .action() 在参数解析完成后执行，options 是解析结果对象
program
  .command("chat")
  .description("启动交互式对话")
  .option("-m, --model <model>", "模型名称", DEFAULT_MODEL)
  .option("-s, --system <prompt>", "系统提示词")
  .action(async (options) => {
    // CLI 入口只负责解析参数，业务逻辑全部在 main.ts 中（关注点分离）
    await startChat({
      model: options.model,
      systemPrompt: options.system,
    });
  });

// 注册子命令：mycli ask <question>
// <question> 是必选参数（不带尖括号的是可选参数）
program
  .command("ask <question>")
  .description("单次提问")
  .option("-m, --model <model>", "模型名称", DEFAULT_MODEL)
  .action(async (question, options) => {
    const { ask } = await import("./main.js");
    await ask(question, { model: options.model });
  });

// parse() 解析 process.argv，匹配到命令后执行对应的 .action()
// 没有 .parse() 的话，上面定义的命令都不会生效
program.parse();