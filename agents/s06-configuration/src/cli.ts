/**
 * s06 — CLI 入口（支持 --model 和 /config 命令）
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { loadConfig, showConfig } from "./config.js";
import { runAgent } from "./agent.js";

const program = new Command();

program
  .name("mycli")
  .version("0.6.0")
  .description("AI Agent CLI — s06: Configuration")
  .option("-m, --model <model>", "使用的模型")
  .option("--max-turns <n>", "最大轮次", parseInt)
  .argument("[prompt]", "直接执行的提示词")
  .action(async (prompt: string | undefined, opts: { model?: string; maxTurns?: number }) => {
    const config = loadConfig({
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.maxTurns ? { maxTurns: opts.maxTurns } : {}),
    });

    if (prompt) {
      await runAgent(prompt, config);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (text: string): Promise<string> =>
      new Promise((resolve) => rl.question(text, resolve));

    console.log(`mycli v0.6.0  [Configuration]  model=${config.model}`);
    console.log("命令: /config 查看配置 | /exit 退出\n");

    while (true) {
      const input = await ask("you> ");
      if (input === "/exit" || input === "/quit") break;
      if (input === "/config") {
        showConfig(config);
        continue;
      }
      if (!input.trim()) continue;
      await runAgent(input, config);
    }

    rl.close();
  });

program.parse();
