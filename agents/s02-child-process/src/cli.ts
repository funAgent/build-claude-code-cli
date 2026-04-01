#!/usr/bin/env node

/**
 * s02 — CLI 入口（在 s01 基础上新增 exec 子命令）
 */

import { Command } from "commander";
import { createRequire } from "node:module";
import { startChat } from "./main.js";
import { execShell, isDangerous } from "./shell.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("mycli")
  .description("AI Agent CLI — 从零构建")
  .version(pkg.version);

program
  .command("chat")
  .description("启动交互式对话")
  .option("-m, --model <model>", "模型名称", "claude-sonnet-4-20250514")
  .option("-s, --system <prompt>", "系统提示词")
  .action(async (options) => {
    await startChat({
      model: options.model,
      systemPrompt: options.system,
    });
  });

program
  .command("exec <command>")
  .description("安全执行 shell 命令（带超时和安全检查）")
  .option("-t, --timeout <ms>", "超时时间（毫秒）", "30000")
  .action(async (command, options) => {
    const danger = isDangerous(command);
    if (danger) {
      console.error(`[安全拦截] ${danger}`);
      process.exit(1);
    }

    console.log(`$ ${command}\n`);
    const result = await execShell(command, {
      timeout: parseInt(options.timeout, 10),
    });

    if (result.stdout) console.log(result.stdout);
    if (result.stderr) console.error(result.stderr);
    if (result.timedOut) console.error("\n[超时] 命令被终止");

    process.exit(result.exitCode);
  });

program.parse();
