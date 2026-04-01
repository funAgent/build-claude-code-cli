/**
 * s18 — RULES.md 三级加载器
 *
 * 加载项目规则文件，按优先级从低到高：
 * 1. 全局规则 — ~/.mycli/RULES.md（用户个人偏好）
 * 2. 项目根规则 — {projectRoot}/RULES.md（团队共享）
 * 3. 子目录规则 — {cwd}/RULES.md（模块专属）
 *
 * 对照 Claude Code: context.ts + utils/claudemd.ts
 * 生产版支持：CLAUDE.md + .claude/CLAUDE.md + .claude/rules/*.md
 *             + CLAUDE.local.md + managed + team + automem
 * 教学版聚焦核心三级机制：global → project → local
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface RuleFile {
  level: "global" | "project" | "local";
  path: string;
  content: string;
}

function findProjectRoot(cwd: string): string {
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    if (
      fs.existsSync(path.join(dir, "package.json")) ||
      fs.existsSync(path.join(dir, ".git"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return cwd;
}

function tryReadFile(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, "utf-8").trim();
    }
  } catch { /* permission denied, etc */ }
  return null;
}

export function loadRules(cwd: string): RuleFile[] {
  const rules: RuleFile[] = [];

  const globalPath = path.join(os.homedir(), ".mycli", "RULES.md");
  const globalContent = tryReadFile(globalPath);
  if (globalContent) {
    rules.push({ level: "global", path: globalPath, content: globalContent });
  }

  const projectRoot = findProjectRoot(cwd);
  const projectPath = path.join(projectRoot, "RULES.md");
  const projectContent = tryReadFile(projectPath);
  if (projectContent) {
    rules.push({ level: "project", path: projectPath, content: projectContent });
  }

  if (cwd !== projectRoot) {
    const localPath = path.join(cwd, "RULES.md");
    const localContent = tryReadFile(localPath);
    if (localContent) {
      rules.push({ level: "local", path: localPath, content: localContent });
    }
  }

  return rules;
}

export function rulesToPromptSection(rules: RuleFile[]): string | null {
  if (rules.length === 0) return null;

  const parts = rules.map((r) => {
    const label =
      r.level === "global"
        ? "Global"
        : r.level === "project"
          ? "Project"
          : "Local";
    return `### ${label} Rules (${path.basename(path.dirname(r.path))})\n\n${r.content}`;
  });

  return ["## Project Rules", "", ...parts].join("\n\n");
}

export function initRulesFile(cwd: string): string {
  const filePath = path.join(cwd, "RULES.md");
  if (fs.existsSync(filePath)) {
    return `RULES.md already exists at ${filePath}`;
  }

  const template = [
    "# Project Rules",
    "",
    "<!-- This file tells the AI agent about your project conventions. -->",
    "",
    "## Code Style",
    "",
    "- Use TypeScript strict mode",
    "- Prefer functional components",
    "",
    "## Project Structure",
    "",
    "- Source code in src/",
    "- Tests in tests/",
    "",
  ].join("\n");

  fs.writeFileSync(filePath, template, "utf-8");
  return `Created RULES.md at ${filePath}`;
}
