/**
 * s03 — CLI 入口
 *
 * 两种运行模式：
 * - 直接传参：mycli "帮我看看文件"
 * - 交互式 REPL：mycli（不传参进入循环）
 */

import { Command } from "commander";
import * as readline from "node:readline";
import { runAgent } from "./agent.js";

const program = new Command();

program
  .name("mycli")
  .version("0.3.0")
  .description("AI Agent CLI — s03: Agent Loop")
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

    console.log("mycli v0.3.0  [Agent Loop]");
    console.log("输入你的问题，Agent 会自动调用工具完成任务");
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
