/**
 * s19 — System Prompt + Prompt Cache
 *
 * 在 s18 分层 prompt 基础上增加缓存支持：
 * - DYNAMIC_BOUNDARY 分隔静态前缀和动态内容
 * - 静态前缀（identity + tool-guide）可以跨会话缓存
 * - 动态部分（environment + rules + style）每次都会变化
 *
 * 对照 Claude Code: constants/prompts.ts 的 SYSTEM_PROMPT_DYNAMIC_BOUNDARY
 * + utils/api.ts 的 splitSysPromptPrefix()
 * + services/api/claude.ts 的 buildSystemPromptBlocks()
 */

import * as os from "node:os";
import * as path from "node:path";
import type { Tool } from "./tool.js";
import { loadRules, rulesToPromptSection } from "./rules.js";

export interface PromptSection {
  name: string;
  content: string;
  // cacheable=true 的 section 会被标记 cache_control，API 会缓存这部分前缀
  // 后续请求只要前缀一致，就以 cache_read 计费（便宜 90%）
  cacheable: boolean;
}

// 逻辑边界标记：cacheable=true 的 section 在边界之前（静态前缀），
// cacheable=false 的 section 在边界之后（动态后缀）
export const DYNAMIC_BOUNDARY = "__DYNAMIC_BOUNDARY__";

function getIdentitySection(): PromptSection {
  return {
    name: "identity",
    cacheable: true,
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
    cacheable: true,
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
    cacheable: false,
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
  return { name: "rules", cacheable: false, content };
}

function getStyleSection(): PromptSection {
  return {
    name: "style",
    cacheable: true,
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

/**
 * 将 sections 拆分为 static prefix 和 dynamic suffix
 *
 * 关键设计：静态前缀拼成一个文本块加 cache_control，
 * 动态部分作为独立文本块，不加 cache_control。
 *
 * 对照 Claude Code: utils/api.ts splitSysPromptPrefix()
 */
export interface SystemPromptBlock {
  text: string;
  cacheScope: "ephemeral" | null;
}

export function splitPromptForCache(
  sections: PromptSection[],
): SystemPromptBlock[] {
  // 按 cacheable 标记分离：静态部分拼成一个大块，动态部分拼成另一个
  const staticParts: string[] = [];
  const dynamicParts: string[] = [];

  for (const s of sections) {
    if (s.cacheable) {
      staticParts.push(s.content);
    } else {
      dynamicParts.push(s.content);
    }
  }

  const blocks: SystemPromptBlock[] = [];

  if (staticParts.length > 0) {
    // 静态前缀加 cache_control: ephemeral → API 缓存 5 分钟
    // 关键前提：identity + tool-guide 在整个会话中保持不变
    blocks.push({
      text: staticParts.join("\n\n"),
      cacheScope: "ephemeral",
    });
  }

  if (dynamicParts.length > 0) {
    // 动态后缀不加 cache_control → 每次都重新计算
    // environment 的日期/cwd 可能变化，rules 可能被用户编辑
    blocks.push({
      text: dynamicParts.join("\n\n"),
      cacheScope: null,
    });
  }

  return blocks;
}

export function sectionsToString(sections: PromptSection[]): string {
  return sections.map((s) => s.content).join("\n\n");
}
