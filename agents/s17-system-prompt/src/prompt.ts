/**
 * s17 — 分层 System Prompt 组装器
 *
 * 系统提示不是一段话，而是多个结构化片段按顺序拼接。
 * 每个片段有明确职责：身份 → 工具指南 → 环境信息 → 风格约束。
 *
 * 对照 Claude Code: constants/prompts.ts 的 getSystemPrompt()
 * 生产版有 20+ 个 section，按 static/dynamic 划分
 * 教学版聚焦核心分层：identity + tools + environment + style
 */

import * as os from "node:os";
import * as path from "node:path";
import type { Tool } from "./tool.js";

export interface PromptSection {
  name: string;
  content: string;
}

function getIdentitySection(): PromptSection {
  return {
    name: "identity",
    content: [
      "You are an interactive CLI assistant powered by Claude.",
      "You help users with coding tasks: reading, writing, and editing files,",
      "running shell commands, searching codebases, and answering questions.",
      "Be concise. Prefer showing code over explaining code.",
    ].join("\n"),
  };
}

function getToolGuideSection(tools: Tool[]): PromptSection {
  const toolList = tools
    .map((t) => `- ${t.name}: ${t.description}`)
    .join("\n");

  return {
    name: "tool-guide",
    content: [
      "## Tools",
      "",
      "You have access to the following tools:",
      "",
      toolList,
      "",
      "### Tool usage guidelines",
      "",
      "- Use glob/grep to search before editing files.",
      "- Prefer file_edit over file_write for existing files.",
      "- Always verify file existence with file_read before editing.",
      "- Keep shell commands short and safe. Avoid destructive commands.",
    ].join("\n"),
  };
}

function getEnvironmentSection(cwd: string): PromptSection {
  const platform = `${os.platform()} ${os.arch()}`;
  const shell = process.env.SHELL || "unknown";
  const nodeVersion = process.version;
  const dirName = path.basename(cwd);

  return {
    name: "environment",
    content: [
      "## Environment",
      "",
      `- Platform: ${platform}`,
      `- Shell: ${shell}`,
      `- Node: ${nodeVersion}`,
      `- Working directory: ${cwd}`,
      `- Project: ${dirName}`,
      `- Date: ${new Date().toISOString().split("T")[0]}`,
    ].join("\n"),
  };
}

function getStyleSection(): PromptSection {
  return {
    name: "style",
    content: [
      "## Response style",
      "",
      "- Be concise. Avoid unnecessary preamble.",
      "- When showing code, use fenced code blocks with language tags.",
      "- When editing files, explain what you changed and why.",
      "- If a task is ambiguous, ask for clarification instead of guessing.",
      "- Do not apologize or say 'I understand'. Just do the task.",
    ].join("\n"),
  };
}

/**
 * 组装完整的 system prompt
 *
 * 关键设计：返回 PromptSection[] 而非单个字符串。
 * 这使得后续的 prompt cache 可以按 section 粒度添加 cache_control，
 * 也方便调试——可以打印每个 section 的名称和长度。
 */
export function buildSystemPrompt(
  tools: Tool[],
  cwd: string,
): PromptSection[] {
  return [
    getIdentitySection(),
    getToolGuideSection(tools),
    getEnvironmentSection(cwd),
    getStyleSection(),
  ];
}

export function sectionsToString(sections: PromptSection[]): string {
  return sections.map((s) => s.content).join("\n\n");
}
