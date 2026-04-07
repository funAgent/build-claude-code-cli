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

import { Command } from "commander";
import { createRequire } from "node:module";
import { startChat } from "./main.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const DEFAULT_MODEL = process.env.MODEL_NAME ?? "claude-sonnet-4-20250514";

const program = new Command();

program
  .name("mycli")
  .description("AI Agent CLI — 从零构建")
  .version(pkg.version);

program
  .command("chat")
  .description("启动交互式对话")
  .option("-m, --model <model>", "模型名称", DEFAULT_MODEL)
  .option("-s, --system <prompt>", "系统提示词")
  .action(async (options) => {
    await startChat({
      model: options.model,
      systemPrompt: options.system,
    });
  });

program
  .command("ask <question>")
  .description("单次提问")
  .option("-m, --model <model>", "模型名称", DEFAULT_MODEL)
  .action(async (question, options) => {
    const { ask } = await import("./main.js");
    await ask(question, { model: options.model });
  });

program.parse();
