/**
 * s30 — SkillTool（技能加载工具）
 *
 * 让 Agent 按需加载特定领域的知识（SKILL.md 文件）。
 * 知识通过 tool_result 注入到对话中，不占用 system prompt。
 *
 * 对照 Claude Code: tools/SkillTool/SkillTool.ts
 * - inline 模式：直接将 SKILL.md 内容注入为 tool_result
 * - fork 模式：创建子 Agent 执行 skill 中的指令
 * - 远程模式：从远程加载 skill（ant 内部）
 * 教学版只实现 inline 模式。
 */

import { buildTool } from "../tool.js";
import { discoverSkills, findSkill } from "../skill-loader.js";

export const skillTool = buildTool({
  name: "skill",
  description:
    "加载一个技能（SKILL.md）来获取特定领域的知识和指令。" +
    "技能文件位于 .skills/ 目录下。" +
    "使用此工具获取编码规范、部署流程、架构指南等专业知识。",
  inputSchema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "要加载的技能名称",
      },
    },
    required: ["name"],
  },
  isReadOnly: true,
  isConcurrencySafe: true,
  async call(input, context) {
    const name = input.name as string;
    const skills = discoverSkills(context.cwd);

    if (skills.length === 0) {
      return {
        output: "未找到任何技能文件。请在 .skills/ 目录下创建 SKILL.md 文件。",
        isError: true,
      };
    }

    const skill = findSkill(skills, name);
    if (!skill) {
      const available = skills.map((s) => `  - ${s.name}`).join("\n");
      return {
        output: `未找到技能 "${name}"。可用的技能:\n${available}`,
        isError: true,
      };
    }

    // 将 SKILL.md 内容注入为 tool_result
    // 对照 Claude Code: 通过 tool_result 注入，而非 system prompt
    return {
      output: [
        `已加载技能: ${skill.name}`,
        `来源: ${skill.filePath}`,
        "",
        "--- 技能内容 ---",
        "",
        skill.content,
      ].join("\n"),
    };
  },
});
