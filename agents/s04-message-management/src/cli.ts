/**
 * s04 — CLI 入口（新增 /stats 命令显示对话统计）
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { Agent } from "./agent.js";

const program = new Command();

program
  .name("mycli")
  .version("0.4.0")
  .description("AI Agent CLI — s04: Message Management")
  .argument("[prompt]", "直接执行的提示词")
  .action(async (prompt?: string) => {
    const agent = new Agent();

    if (prompt) {
      await agent.run(prompt);
      agent.showStats();
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (text: string): Promise<string> =>
      new Promise((resolve) => rl.question(text, resolve));

    console.log("mycli v0.4.0  [Message Management]");
    console.log("命令: /stats 查看统计 | /exit 退出\n");

    while (true) {
      const input = await ask("you> ");
      if (input === "/exit" || input === "/quit") break;
      if (input === "/stats") {
        agent.showStats();
        continue;
      }
      if (!input.trim()) continue;
      await agent.run(input);
    }

    agent.showStats();
    rl.close();
  });

program.parse();
