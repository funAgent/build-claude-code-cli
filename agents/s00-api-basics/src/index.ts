/**
 * s00 — AI API 入门
 *
 * 最简单的 Anthropic Messages API 调用：
 * 发送一条消息，拿回模型回复，打印到终端。
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function main() {
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      { role: "user", content: "用一句话解释：什么是 AI Agent？" },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (textBlock && textBlock.type === "text") {
    console.log(textBlock.text);
  }

  console.log("\n--- 使用量 ---");
  console.log(`输入 tokens: ${response.usage.input_tokens}`);
  console.log(`输出 tokens: ${response.usage.output_tokens}`);
  console.log(`停止原因: ${response.stop_reason}`);
}

main().catch(console.error);
