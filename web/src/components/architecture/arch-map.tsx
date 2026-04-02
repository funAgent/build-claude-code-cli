"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PHASES, VERSION_META, type PhaseId } from "@/lib/constants";
import { useLocale } from "@/lib/i18n";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ModuleNode {
  id: string;
  label: string;
  sessions: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

interface Dependency {
  from: string;
  to: string;
}

const PHASE_GROUPS: { phase: PhaseId; modules: Omit<ModuleNode, "x" | "y" | "width" | "height">[] }[] = [
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

const DEPENDENCIES: Dependency[] = [
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

function layoutModules() {
  const nodes: ModuleNode[] = [];
  const phaseRects: {
    phase: PhaseId;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    label: string;
  }[] = [];

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

function getNodeCenter(node: ModuleNode) {
  return { cx: node.x + node.width / 2, cy: node.y + node.height / 2 };
}

interface ArchMapProps {
  compact?: boolean;
}

export function ArchMap({ compact }: ArchMapProps) {
  const locale = useLocale();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<PhaseId>>(
    new Set(PHASE_GROUPS.map((g) => g.phase))
  );

  const { nodes, phaseRects, totalHeight } = layoutModules();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const togglePhase = useCallback((phaseId: PhaseId) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  const relatedModules = new Set<string>();
  if (hoveredModule) {
    relatedModules.add(hoveredModule);
    for (const dep of DEPENDENCIES) {
      if (dep.from === hoveredModule) relatedModules.add(dep.to);
      if (dep.to === hoveredModule) relatedModules.add(dep.from);
    }
  }

  const hoveredNode = hoveredModule ? nodeMap.get(hoveredModule) : null;
  const hoveredSessions = hoveredNode?.sessions ?? [];

  const svgWidth = 600;

  if (compact) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {PHASE_GROUPS.map((group) => {
            const phaseDef = PHASES.find((p) => p.id === group.phase);
            return (
              <a
                key={group.phase}
                href={`/${locale}/architecture`}
                className="group rounded-lg border border-zinc-200 p-2 text-center transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
              >
                <div
                  className="mx-auto mb-1 h-1.5 w-8 rounded-full"
                  style={{ backgroundColor: phaseDef?.color }}
                />
                <p className="text-[10px] font-medium leading-tight">{phaseDef?.label}</p>
                <p className="text-[9px] text-zinc-400">{group.modules.length} 模块</p>
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <svg
          viewBox={`0 0 ${svgWidth} ${totalHeight}`}
          className="w-full"
          style={{ minWidth: 480 }}
        >
          {phaseRects.map((pr) => {
            const isExpanded = expandedPhases.has(pr.phase);
            return (
              <g key={pr.phase}>
                <rect
                  x={pr.x}
                  y={pr.y}
                  width={pr.width}
                  height={isExpanded ? pr.height : 24}
                  rx={8}
                  fill={pr.color}
                  fillOpacity={0.06}
                  stroke={pr.color}
                  strokeOpacity={0.2}
                  strokeWidth={1}
                  className="cursor-pointer"
                  onClick={() => togglePhase(pr.phase)}
                />
                <text
                  x={pr.x + 10}
                  y={pr.y + 16}
                  fontSize={10}
                  fontWeight={600}
                  fill={pr.color}
                  className="cursor-pointer select-none"
                  onClick={() => togglePhase(pr.phase)}
                >
                  {isExpanded ? "▾" : "▸"} {pr.label}
                </text>
              </g>
            );
          })}

          {DEPENDENCIES.map((dep, i) => {
            const from = nodeMap.get(dep.from);
            const to = nodeMap.get(dep.to);
            if (!from || !to) return null;

            const fromPhase = PHASE_GROUPS.find((g) => g.modules.some((m) => m.id === dep.from))?.phase;
            const toPhase = PHASE_GROUPS.find((g) => g.modules.some((m) => m.id === dep.to))?.phase;
            if (fromPhase && !expandedPhases.has(fromPhase)) return null;
            if (toPhase && !expandedPhases.has(toPhase)) return null;

            const { cx: x1, cy: y1 } = getNodeCenter(from);
            const { cx: x2, cy: y2 } = getNodeCenter(to);

            const isHighlighted =
              hoveredModule && (dep.from === hoveredModule || dep.to === hoveredModule);

            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isHighlighted ? "#3B82F6" : "#71717A"}
                strokeOpacity={isHighlighted ? 0.6 : 0.12}
                strokeWidth={isHighlighted ? 1.5 : 0.5}
                strokeDasharray={isHighlighted ? undefined : "3,3"}
                markerEnd={isHighlighted ? "url(#arrow)" : undefined}
              />
            );
          })}

          <defs>
            <marker id="arrow" viewBox="0 0 6 6" refX={6} refY={3} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
              <path d="M 0 0 L 6 3 L 0 6 Z" fill="#3B82F6" fillOpacity={0.6} />
            </marker>
          </defs>

          {nodes.map((node) => {
            const phaseGroup = PHASE_GROUPS.find((g) => g.modules.some((m) => m.id === node.id));
            if (phaseGroup && !expandedPhases.has(phaseGroup.phase)) return null;

            const isHovered = hoveredModule === node.id;
            const isRelated = relatedModules.has(node.id);
            const dimmed = hoveredModule && !isRelated;

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredModule(node.id)}
                onMouseLeave={() => setHoveredModule(null)}
                className="cursor-pointer"
                onClick={() => {
                  const session = node.sessions[0];
                  if (session) window.location.href = `/${locale}/${session}`;
                }}
              >
                <motion.rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx={6}
                  fill={isHovered ? node.color : "var(--color-bg)"}
                  fillOpacity={dimmed ? 0.3 : 1}
                  stroke={node.color}
                  strokeWidth={isHovered ? 2 : 1}
                  strokeOpacity={dimmed ? 0.2 : isRelated ? 1 : 0.5}
                  animate={{
                    scale: isHovered ? 1.02 : 1,
                  }}
                  transition={{ duration: 0.15 }}
                />
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fontWeight={isHovered ? 600 : 400}
                  fill={isHovered ? "#fff" : dimmed ? "#A1A1AA" : "var(--color-text)"}
                  className="pointer-events-none select-none"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <div className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: hoveredNode.color }}
              />
              <span className="font-medium">{hoveredNode.label}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hoveredSessions.map((s) => (
                <a
                  key={s}
                  href={`/${locale}/${s}`}
                  className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
                >
                  {s} — {VERSION_META[s]?.title}
                </a>
              ))}
            </div>
            {hoveredSessions[0] && VERSION_META[hoveredSessions[0]]?.keyInsight && (
              <p className="mt-2 text-xs italic text-zinc-500">
                {VERSION_META[hoveredSessions[0]].keyInsight}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
