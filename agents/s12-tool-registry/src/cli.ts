/**
 * s12 — CLI 入口（新增 /tools 命令 + --read-only 模式）
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { Agent } from "./agent.js";

const program = new Command();

program
  .name("mycli")
  .version("0.12.0")
  .description("AI Agent CLI — s12: Tool Registry")
  .option("--read-only", "只读模式（仅启用读工具）")
  .argument("[prompt]", "直接执行的提示词")
  .action(async (prompt: string | undefined, opts: { readOnly?: boolean }) => {
    const agent = new Agent({ readOnlyMode: opts.readOnly });

    if (prompt) {
      await agent.run(prompt);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const ask = (t: string): Promise<string> =>
      new Promise((r) => rl.question(t, r));

    console.log(`mycli v0.12.0  [Tool Registry]${opts.readOnly ? " (只读模式)" : ""}`);
    console.log("命令: /tools 列出工具 | /exit 退出\n");

    while (true) {
      const input = await ask("you> ");
      if (input === "/exit" || input === "/quit") break;
      if (input === "/tools") {
        agent.listTools();
        continue;
      }
      if (!input.trim()) continue;
      await agent.run(input);
    }

    rl.close();
  });

program.parse();
