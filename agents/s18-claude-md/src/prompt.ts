/**
 * s18 — System Prompt（含项目规则）
 *
 * 在 s17 的分层基础上新增 rules section。
 * 规则来自 RULES.md 三级加载，注入到 prompt 的环境 section 之后。
 */

import * as os from "node:os";
import * as path from "node:path";
import type { Tool } from "./tool.js";
import { loadRules, rulesToPromptSection } from "./rules.js";

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
  const dirName = path.basename(cwd);

  return {
    name: "environment",
    content: [
      "## Environment",
      "",
      `- Platform: ${platform}`,
      `- Shell: ${shell}`,
      `- Node: ${process.version}`,
      `- Working directory: ${cwd}`,
      `- Project: ${dirName}`,
      `- Date: ${new Date().toISOString().split("T")[0]}`,
    ].join("\n"),
  };
}

function getRulesSection(cwd: string): PromptSection | null {
  const rules = loadRules(cwd);
  const content = rulesToPromptSection(rules);
  if (!content) return null;
  return { name: "rules", content };
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
      "- IMPORTANT: Follow any project rules defined above.",
    ].join("\n"),
  };
}

export function buildSystemPrompt(
  tools: Tool[],
  cwd: string,
): PromptSection[] {
  const sections: PromptSection[] = [
    getIdentitySection(),
    getToolGuideSection(tools),
    getEnvironmentSection(cwd),
  ];

  const rules = getRulesSection(cwd);
  if (rules) sections.push(rules);

  sections.push(getStyleSection());
  return sections;
}

export function sectionsToString(sections: PromptSection[]): string {
  return sections.map((s) => s.content).join("\n\n");
}
