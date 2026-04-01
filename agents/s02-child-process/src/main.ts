/**
 * s02 — 核心逻辑（与 s01 相同，下一课 s03 将接入 shell 执行）
 */

import Anthropic from "@anthropic-ai/sdk";
import * as readline from "node:readline";

const client = new Anthropic();

type Message = Anthropic.MessageParam;

interface ChatOptions {
  model: string;
  systemPrompt?: string;
}

export async function startChat(options: ChatOptions): Promise<void> {
  const messages: Message[] = [];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function prompt(text: string): Promise<string> {
    return new Promise((resolve) => rl.question(text, resolve));
  }

  console.log(`mycli v0.2.0  model=${options.model}`);
  if (options.systemPrompt) {
    console.log(`system: ${options.systemPrompt}`);
  }
  console.log('输入 /exit 退出\n');

  while (true) {
    const userInput = await prompt("you> ");

    if (userInput === "/exit" || userInput === "/quit") break;
    if (!userInput.trim()) continue;

    messages.push({ role: "user", content: userInput });

    const response = await client.messages.create({
      model: options.model,
      max_tokens: 2048,
      ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
    messages.push({ role: "assistant", content: text });

    console.log(`\nassistant> ${text}`);
    console.log(
      `  [${response.usage.input_tokens} in / ${response.usage.output_tokens} out | msgs=${messages.length}]\n`
    );
  }

  rl.close();
}
