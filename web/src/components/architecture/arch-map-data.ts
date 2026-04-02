import { PHASES, type PhaseId } from "@/lib/constants";

export interface ModuleNode {
  id: string;
  label: string;
  sessions: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface Dependency {
  from: string;
  to: string;
}

export const PHASE_GROUPS: {
  phase: PhaseId;
  modules: Omit<ModuleNode, "x" | "y" | "width" | "height">[];
}[] = [
  {
    phase: "preparation",
    modules: [
      { id: "api", label: "AI API", sessions: ["s00"], color: "#6B7280" },
      { id: "cli", label: "CLI 脚手架", sessions: ["s01"], color: "#6B7280" },
      { id: "subprocess", label: "子进程", sessions: ["s02"], color: "#6B7280" },
    ],
  },
  {
    phase: "minimal-agent",
    modules: [
      { id: "agent-loop", label: "Agent Loop", sessions: ["s03"], color: "#3B82F6" },
      { id: "messages", label: "消息管理", sessions: ["s04"], color: "#3B82F6" },
      { id: "errors", label: "错误处理", sessions: ["s05"], color: "#3B82F6" },
      { id: "config", label: "配置管理", sessions: ["s06"], color: "#3B82F6" },
      { id: "cost", label: "成本追踪", sessions: ["s07"], color: "#3B82F6" },
    ],
  },
  {
    phase: "tool-system",
    modules: [
      { id: "tool-abstract", label: "Tool 抽象", sessions: ["s08"], color: "#10B981" },
      { id: "file-tools", label: "文件工具", sessions: ["s09", "s10"], color: "#10B981" },
      { id: "search-tools", label: "搜索工具", sessions: ["s11"], color: "#10B981" },
      { id: "tool-registry", label: "工具注册表", sessions: ["s12"], color: "#10B981" },
    ],
  },
  {
    phase: "terminal-ui",
    modules: [
      { id: "ink", label: "Ink 框架", sessions: ["s13"], color: "#8B5CF6" },
      { id: "msg-list", label: "消息列表", sessions: ["s14"], color: "#8B5CF6" },
      { id: "input", label: "输入框", sessions: ["s15"], color: "#8B5CF6" },
      { id: "repl", label: "REPL", sessions: ["s16"], color: "#8B5CF6" },
    ],
  },
  {
    phase: "prompt-engineering",
    modules: [
      { id: "system-prompt", label: "System Prompt", sessions: ["s17"], color: "#EC4899" },
      { id: "project-rules", label: "项目规则", sessions: ["s18"], color: "#EC4899" },
      { id: "prompt-cache", label: "Prompt Cache", sessions: ["s19"], color: "#EC4899" },
    ],
  },
  {
    phase: "streaming-perf",
    modules: [
      { id: "streaming", label: "Streaming", sessions: ["s20", "s21"], color: "#F59E0B" },
      { id: "parallel", label: "并行执行", sessions: ["s22"], color: "#F59E0B" },
      { id: "startup", label: "启动优化", sessions: ["s23"], color: "#F59E0B" },
    ],
  },
  {
    phase: "context-mgmt",
    modules: [
      { id: "compact", label: "自动压缩", sessions: ["s24", "s25"], color: "#14B8A6" },
      { id: "large-output", label: "大输出处理", sessions: ["s26"], color: "#14B8A6" },
    ],
  },
  {
    phase: "agent-intelligence",
    modules: [
      { id: "todo", label: "TodoWrite", sessions: ["s27"], color: "#6366F1" },
      { id: "subagent", label: "Subagent", sessions: ["s28", "s29"], color: "#6366F1" },
      { id: "skill", label: "Skill 系统", sessions: ["s30"], color: "#6366F1" },
      { id: "task", label: "Task System", sessions: ["s31"], color: "#6366F1" },
    ],
  },
  {
    phase: "security",
    modules: [
      { id: "perm-engine", label: "权限引擎", sessions: ["s32"], color: "#EF4444" },
      { id: "perm-ui", label: "权限 UI", sessions: ["s33"], color: "#EF4444" },
      { id: "perm-sub", label: "子 Agent 权限", sessions: ["s34"], color: "#EF4444" },
    ],
  },
  {
    phase: "ecosystem",
    modules: [
      { id: "mcp", label: "MCP", sessions: ["s35", "s36"], color: "#06B6D4" },
      { id: "session", label: "会话持久化", sessions: ["s37"], color: "#06B6D4" },
      { id: "plugin", label: "Plugin", sessions: ["s38"], color: "#06B6D4" },
    ],
  },
  {
    phase: "multi-agent",
    modules: [
      { id: "agent-def", label: "Agent 定义", sessions: ["s39"], color: "#F97316" },
      { id: "coordinator", label: "Coordinator", sessions: ["s40"], color: "#F97316" },
      { id: "team", label: "Team", sessions: ["s41", "s42"], color: "#F97316" },
      { id: "worktree", label: "Worktree", sessions: ["s43"], color: "#F97316" },
    ],
  },
  {
    phase: "production",
    modules: [
      { id: "recovery", label: "错误恢复", sessions: ["s44"], color: "#84CC16" },
      { id: "flags", label: "Feature Flags", sessions: ["s45"], color: "#84CC16" },
      { id: "package", label: "打包分发", sessions: ["s46"], color: "#84CC16" },
      { id: "native", label: "Native", sessions: ["s47"], color: "#84CC16" },
      { id: "telemetry", label: "遥测", sessions: ["s48"], color: "#84CC16" },
    ],
  },
];

export const DEPENDENCIES: Dependency[] = [
  { from: "api", to: "agent-loop" },
  { from: "cli", to: "agent-loop" },
  { from: "subprocess", to: "agent-loop" },
  { from: "agent-loop", to: "tool-abstract" },
  { from: "messages", to: "agent-loop" },
  { from: "errors", to: "agent-loop" },
  { from: "tool-abstract", to: "file-tools" },
  { from: "tool-abstract", to: "search-tools" },
  { from: "tool-abstract", to: "tool-registry" },
  { from: "tool-registry", to: "ink" },
  { from: "agent-loop", to: "streaming" },
  { from: "agent-loop", to: "system-prompt" },
  { from: "messages", to: "compact" },
  { from: "agent-loop", to: "subagent" },
  { from: "subagent", to: "perm-engine" },
  { from: "tool-registry", to: "mcp" },
  { from: "subagent", to: "coordinator" },
  { from: "coordinator", to: "team" },
  { from: "agent-loop", to: "recovery" },
];

const COL_WIDTH = 140;
const ROW_HEIGHT = 44;
const MODULE_H = 32;
const MODULE_W = 120;
const PHASE_PAD_TOP = 28;
const PHASE_PAD_BOTTOM = 8;
const PHASE_GAP = 12;
const LEFT_MARGIN = 16;

export interface PhaseRect {
  phase: PhaseId;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  label: string;
}

export interface LayoutResult {
  nodes: ModuleNode[];
  phaseRects: PhaseRect[];
  totalHeight: number;
}

export function layoutModules(): LayoutResult {
  const nodes: ModuleNode[] = [];
  const phaseRects: PhaseRect[] = [];

  let currentY = 8;

  for (const group of PHASE_GROUPS) {
    const phaseDef = PHASES.find((p) => p.id === group.phase);
    const phaseColor = phaseDef?.color ?? "#666";
    const phaseLabel = phaseDef?.label ?? group.phase;

    const rows = Math.ceil(group.modules.length / 4);
    const phaseHeight = PHASE_PAD_TOP + rows * ROW_HEIGHT + PHASE_PAD_BOTTOM;
    const cols = Math.min(group.modules.length, 4);
    const phaseWidth = cols * COL_WIDTH + 24;

    phaseRects.push({
      phase: group.phase,
      x: LEFT_MARGIN,
      y: currentY,
      width: phaseWidth,
      height: phaseHeight,
      color: phaseColor,
      label: phaseLabel,
    });

    group.modules.forEach((mod, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      nodes.push({
        ...mod,
        x: LEFT_MARGIN + 12 + col * COL_WIDTH,
        y: currentY + PHASE_PAD_TOP + row * ROW_HEIGHT,
        width: MODULE_W,
        height: MODULE_H,
      });
    });

    currentY += phaseHeight + PHASE_GAP;
  }

  return { nodes, phaseRects, totalHeight: currentY };
}

export function getNodeCenter(node: ModuleNode) {
  return { cx: node.x + node.width / 2, cy: node.y + node.height / 2 };
}
