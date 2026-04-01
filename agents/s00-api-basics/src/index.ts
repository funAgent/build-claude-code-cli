/**
 * s00 — AI API 入门
 *
 * 最简单的 Anthropic Messages API 调用：
 * 发送一条消息，拿回模型回复，打印到终端。
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function main() {
  // Messages API 的最小调用：model + max_tokens + messages 三要素
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    // messages 是一个数组，每个元素有 role 和 content
    // 这个数组就是 Agent 的"记忆"——后续我们会不断往里 push
    messages: [
      { role: "user", content: "用一句话解释：什么是 AI Agent？" },
    ],
  });

  // response.content 是一个 ContentBlock 数组，不是字符串
  // 可能包含 text、tool_use 等不同类型的 block
  const textBlock = response.content.find((block) => block.type === "text");
  if (textBlock && textBlock.type === "text") {
    console.log(textBlock.text);
  }

  // usage 对象包含本次请求的 token 消耗，是成本控制的基础数据
  console.log("\n--- 使用量 ---");
  console.log(`输入 tokens: ${response.usage.input_tokens}`);
  console.log(`输出 tokens: ${response.usage.output_tokens}`);
  // stop_reason: "end_turn"=自然结束, "tool_use"=需要调用工具, "max_tokens"=达到上限
  console.log(`停止原因: ${response.stop_reason}`);
}

main().catch(console.error);
