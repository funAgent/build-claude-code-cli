/**
 * s09 — CLI 入口
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { Agent } from "./agent.js";

const program = new Command();
program
  .name("mycli").version("0.9.0")
  .description("AI Agent CLI — s09: File Tools")
  .argument("[prompt]", "直接执行的提示词")
  .action(async (prompt?: string) => {
    const agent = new Agent();
    if (prompt) { await agent.run(prompt); return; }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (t: string): Promise<string> => new Promise((r) => rl.question(t, r));

    console.log("mycli v0.9.0  [File Tools: bash + file_read + file_write]");
    console.log("命令: /exit 退出\n");

    while (true) {
      const input = await ask("you> ");
      if (input === "/exit" || input === "/quit") break;
      if (!input.trim()) continue;
      await agent.run(input);
    }
    rl.close();
  });

program.parse();
