/**
 * s00 — 多轮对话
 *
 * 展示 messages 数组如何维护对话历史：
 * 每次把用户输入 push 进 messages，
 * 再把模型回复也 push 进去，循环。
 *
 * 这就是 Agent 的记忆原型。
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline";

const client = new Anthropic();

type Message = Anthropic.MessageParam;

async function chat() {
  const messages: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function ask(prompt: string): Promise<string> {
    return new Promise((resolve) => rl.question(prompt, resolve));
  }

  console.log("多轮对话 Demo（输入 exit 退出）\n");

  while (true) {
    const userInput = await ask("你: ");
    if (userInput.toLowerCase() === "exit") break;

    messages.push({ role: "user", content: userInput });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const assistantText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    messages.push({ role: "assistant", content: assistantText });

    console.log(`\nAI: ${assistantText}`);
    console.log(`  [${response.usage.input_tokens} in / ${response.usage.output_tokens} out | 历史 ${messages.length} 条]\n`);
  }

  rl.close();
  console.log("\n最终 messages 数组长度:", messages.length);
}

chat().catch(console.error);
