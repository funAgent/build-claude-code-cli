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
  // messages 数组是"对话记忆"——每次请求都把完整历史发给 API
  // 这就是 LLM 实现多轮对话的方式：无状态 API + 客户端维护状态
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

    // 1. 用户输入 → push 到 messages
    messages.push({ role: "user", content: userInput });

    // 2. 把完整的 messages 历史发给 API
    // 注意：随着对话增长，input_tokens 会越来越多（成本递增）
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const assistantText = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // 3. 模型回复也 push 进 messages → 形成"记忆"
    // 下一轮请求时，模型能看到之前所有的对话
    messages.push({ role: "assistant", content: assistantText });

    console.log(`\nAI: ${assistantText}`);
    console.log(`  [${response.usage.input_tokens} in / ${response.usage.output_tokens} out | 历史 ${messages.length} 条]\n`);
  }

  rl.close();
  console.log("\n最终 messages 数组长度:", messages.length);
}

chat().catch(console.error);
