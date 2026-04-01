/**
 * s39 — Agent 定义
 *
 * 好的 Agent 系统让用户通过配置文件定义新 Agent——零代码扩展。
 * 用户只需在 .agents/ 目录下放一个 Markdown 文件，就能创建新的专用 Agent。
 *
 * 关键流程：
 * 1. 定义 AgentDefinition 类型（name, systemPrompt, tools, model）
 * 2. 从多来源加载（built-in / user / project / plugin）
 * 3. 按优先级合并（后者覆盖前者）
 * 4. 暴露 `agents` 子命令查看可用 Agent
 *
 * 对照 Claude Code:
 * - tools/AgentTool/loadAgentsDir.ts (~300 行)
 * - BaseAgentDefinition / CustomAgentDefinition / PluginAgentDefinition
 * - getAgentDefinitionsWithOverrides + getActiveAgentsFromList
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ── 类型定义 ─────────────────────────────────────────────────

/**
 * Agent 定义的来源。
 * 对照 Claude Code: source 字段（built-in / user / project / plugin / flag）
 */
export type AgentSource = "built-in" | "user" | "project" | "plugin";

/**
 * Agent 定义。
 * 对照 Claude Code: BaseAgentDefinition 联合类型
 */
export interface AgentDefinition {
  /** Agent 类型名（唯一标识） */
  agentType: string;
  /** 描述何时使用此 Agent */
  whenToUse: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 允许使用的工具白名单（空 = 全部） */
  tools?: string[];
  /** 禁止使用的工具 */
  disallowedTools?: string[];
  /** 使用的模型 */
  model?: string;
  /** 最大对话轮数 */
  maxTurns?: number;
  /** 来源 */
  source: AgentSource;
  /** 是否需要 worktree 隔离 */
  isolation?: "none" | "worktree";
}

// ── 内置 Agent ───────────────────────────────────────────────

/**
 * 获取内置 Agent 定义。
 * 对照 Claude Code: getBuiltInAgents()
 */
function getBuiltInAgents(): AgentDefinition[] {
  return [
    {
      agentType: "coder",
      whenToUse: "编写、修改和调试代码",
      systemPrompt:
        "你是一个代码助手。帮助用户编写、修改和调试代码。" +
        "优先使用已有的编码规范和项目约定。",
      source: "built-in",
    },
    {
      agentType: "reviewer",
      whenToUse: "代码审查和质量分析",
      systemPrompt:
        "你是一个代码审查员。分析代码质量，找出问题和改进建议。" +
        "不要修改代码，只提供审查意见。",
      tools: ["file_read", "glob", "grep", "bash"],
      source: "built-in",
    },
  ];
}

// ── Markdown 解析 ────────────────────────────────────────────

/**
 * 从 Markdown 文件解析 Agent 定义。
 *
 * 对照 Claude Code: parseAgentFromMarkdown
 * 格式：
 * ---
 * agentType: my-agent
 * whenToUse: 做某件事
 * tools: bash, file_read
 * ---
 * 系统提示词内容...
 */
export function parseAgentFromMarkdown(
  content: string,
  source: AgentSource,
): AgentDefinition | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) return null;

  const [, frontmatter, body] = frontmatterMatch;
  const fields: Record<string, string> = {};

  for (const line of frontmatter.split("\n")) {
    const [key, ...valueParts] = line.split(":");
    if (key && valueParts.length > 0) {
      fields[key.trim()] = valueParts.join(":").trim();
    }
  }

  if (!fields.agentType || !fields.whenToUse) return null;

  const definition: AgentDefinition = {
    agentType: fields.agentType,
    whenToUse: fields.whenToUse,
    systemPrompt: body.trim(),
    source,
  };

  if (fields.tools) {
    definition.tools = fields.tools.split(",").map((t) => t.trim());
  }
  if (fields.disallowedTools) {
    definition.disallowedTools = fields.disallowedTools.split(",").map((t) => t.trim());
  }
  if (fields.model) {
    definition.model = fields.model;
  }
  if (fields.maxTurns) {
    definition.maxTurns = parseInt(fields.maxTurns, 10);
  }
  if (fields.isolation) {
    definition.isolation = fields.isolation as "none" | "worktree";
  }

  return definition;
}

// ── 多来源加载 ───────────────────────────────────────────────

/**
 * 从目录加载 Agent Markdown 文件。
 */
function loadAgentsFromDir(dir: string, source: AgentSource): AgentDefinition[] {
  if (!existsSync(dir)) return [];

  const agents: AgentDefinition[] = [];

  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    const content = readFileSync(join(dir, file), "utf-8");
    const agent = parseAgentFromMarkdown(content, source);
    if (agent) agents.push(agent);
  }

  return agents;
}

/**
 * 从所有来源加载并合并 Agent 定义。
 *
 * 对照 Claude Code: getAgentDefinitionsWithOverrides
 * 优先级: built-in < plugin < user < project
 * 同名 Agent 后者覆盖前者。
 */
export function loadAllAgentDefinitions(cwd: string = process.cwd()): {
  all: AgentDefinition[];
  active: AgentDefinition[];
} {
  const builtIn = getBuiltInAgents();

  const userDir = join(homedir(), ".agent-cli", "agents");
  const userAgents = loadAgentsFromDir(userDir, "user");

  const projectDir = join(cwd, ".agents");
  const projectAgents = loadAgentsFromDir(projectDir, "project");

  const all = [...builtIn, ...userAgents, ...projectAgents];

  const active = getActiveAgents(all);

  return { all, active };
}

/**
 * 按优先级合并同名 Agent（后者覆盖前者）。
 *
 * 对照 Claude Code: getActiveAgentsFromList
 * 分组顺序：built-in → plugin → user → project → managed
 * 同名 set 覆盖 → 高优先级的保留
 */
function getActiveAgents(agents: AgentDefinition[]): AgentDefinition[] {
  const sourceOrder: AgentSource[] = ["built-in", "plugin", "user", "project"];

  const sorted = [...agents].sort(
    (a, b) => sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source),
  );

  const map = new Map<string, AgentDefinition>();
  for (const agent of sorted) {
    map.set(agent.agentType, agent);
  }

  return Array.from(map.values());
}

/**
 * 格式化 Agent 列表输出（用于 `agents` 子命令）。
 *
 * 对照 Claude Code: cli/handlers/agents.ts → agentsHandler
 */
export function formatAgentList(agents: AgentDefinition[]): string {
  if (agents.length === 0) return "没有可用的 Agent。";

  const lines: string[] = ["可用 Agent：", ""];

  const grouped = new Map<AgentSource, AgentDefinition[]>();
  for (const agent of agents) {
    const list = grouped.get(agent.source) ?? [];
    list.push(agent);
    grouped.set(agent.source, list);
  }

  const sourceLabels: Record<AgentSource, string> = {
    "built-in": "内置",
    plugin: "插件",
    user: "用户",
    project: "项目",
  };

  for (const [source, list] of grouped) {
    lines.push(`  [${sourceLabels[source]}]`);
    for (const agent of list) {
      lines.push(`    ${agent.agentType} — ${agent.whenToUse}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
