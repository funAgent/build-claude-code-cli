/**
 * s07 — CLI 入口（新增 /cost 命令）
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { Agent } from "./agent.js";

const program = new Command();

program
  .name("mycli")
  .version("0.7.0")
  .description("AI Agent CLI — s07: Cost Tracking")
  .argument("[prompt]", "直接执行的提示词")
  .action(async (prompt?: string) => {
    const agent = new Agent();

    if (prompt) {
      await agent.run(prompt);
      agent.showCost();
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (text: string): Promise<string> =>
      new Promise((resolve) => rl.question(text, resolve));

    console.log("mycli v0.7.0  [Cost Tracking]");
    console.log("命令: /cost 查看成本 | /exit 退出\n");

    while (true) {
      const input = await ask("you> ");
      if (input === "/exit" || input === "/quit") break;
      if (input === "/cost") {
        agent.showCost();
        continue;
      }
      if (!input.trim()) continue;
      await agent.run(input);
    }

    agent.showCost();
    rl.close();
  });

program.parse();
