/**
 * s05 — CLI 入口
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { runAgent } from "./agent.js";

const program = new Command();

program
  .name("mycli")
  .version("0.5.0")
  .description("AI Agent CLI — s05: Error Handling")
  .argument("[prompt]", "直接执行的提示词")
  .action(async (prompt?: string) => {
    if (prompt) {
      await runAgent(prompt);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (text: string): Promise<string> =>
      new Promise((resolve) => rl.question(text, resolve));

    console.log("mycli v0.5.0  [Error Handling]");
    console.log("输入 /exit 退出\n");

    while (true) {
      const input = await ask("you> ");
      if (input === "/exit" || input === "/quit") break;
      if (!input.trim()) continue;
      await runAgent(input);
    }

    rl.close();
  });

program.parse();
