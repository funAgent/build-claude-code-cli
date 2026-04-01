/**
 * s30 — Skill 加载器
 *
 * Skill 是一种按需加载的知识包：Agent 在需要特定领域知识时，
 * 通过 SkillTool 从 SKILL.md 文件加载指令和上下文。
 *
 * 关键设计：知识通过 tool_result 注入，而不是放在 system prompt 中。
 * 这样只有在需要时才消耗 token，不影响其他对话。
 *
 * 对照 Claude Code: tools/SkillTool/SkillTool.ts
 * - SKILL.md 文件发现和解析
 * - 支持 inline（直接注入）和 fork（子 Agent 执行）两种模式
 * - 远程技能加载（ant 内部功能）
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";

/**
 * Skill 定义。
 * 对照 Claude Code: Command 类型（type === 'prompt'）
 */
export interface Skill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

/**
 * 从目录中发现所有 SKILL.md 文件。
 *
 * 搜索路径：
 * - .skills/ 目录下的每个子目录中的 SKILL.md
 * - 项目根目录的 SKILL.md
 *
 * 对照 Claude Code: getCommands() 扫描 ~/.claude/skills/ 和项目 .cursor/skills/
 */
export function discoverSkills(projectRoot: string): Skill[] {
  const skills: Skill[] = [];

  // 项目级 skills 目录
  const skillsDir = join(projectRoot, ".skills");
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillFile = join(skillsDir, entry.name, "SKILL.md");
        if (existsSync(skillFile)) {
          const content = readFileSync(skillFile, "utf-8");
          const parsed = parseSkillFile(content, entry.name);
          skills.push({ ...parsed, filePath: skillFile });
        }
      }
    } catch {
      // 目录不可读，跳过
    }
  }

  // 根目录 SKILL.md
  const rootSkill = join(projectRoot, "SKILL.md");
  if (existsSync(rootSkill)) {
    const content = readFileSync(rootSkill, "utf-8");
    const parsed = parseSkillFile(content, "project");
    skills.push({ ...parsed, filePath: rootSkill });
  }

  return skills;
}

/**
 * 解析 SKILL.md 文件。
 *
 * 格式约定：
 * - 第一行 # 标题 作为 skill name
 * - 第一段落作为 description
 * - 完整内容作为注入内容
 *
 * 对照 Claude Code: parseFrontmatter() — 支持 YAML frontmatter
 * 教学版简化为纯 Markdown 解析。
 */
function parseSkillFile(
  content: string,
  fallbackName: string,
): Omit<Skill, "filePath"> {
  const lines = content.split("\n");

  // 提取标题
  let name = fallbackName;
  const titleLine = lines.find((l) => l.startsWith("# "));
  if (titleLine) {
    name = titleLine.replace(/^#\s+/, "").trim();
  }

  // 提取描述（第一个非空、非标题的段落）
  let description = "";
  let foundTitle = false;
  for (const line of lines) {
    if (line.startsWith("# ")) {
      foundTitle = true;
      continue;
    }
    if (foundTitle && line.trim()) {
      description = line.trim();
      break;
    }
  }

  return { name, description: description || name, content };
}

/**
 * 按名称查找 skill。
 */
export function findSkill(
  skills: Skill[],
  name: string,
): Skill | undefined {
  return skills.find(
    (s) =>
      s.name.toLowerCase() === name.toLowerCase() ||
      basename(s.filePath, ".md").toLowerCase() === name.toLowerCase(),
  );
}
