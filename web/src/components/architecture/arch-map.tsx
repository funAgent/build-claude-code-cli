"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PHASES, VERSION_META, type PhaseId } from "@/lib/constants";
import { useLocale } from "@/lib/i18n";
import {
  PHASE_GROUPS,
  DEPENDENCIES,
  layoutModules,
  getNodeCenter,
  type ModuleNode,
} from "./arch-map-data";

interface ArchMapProps {
  compact?: boolean;
}

export function ArchMap({ compact }: ArchMapProps) {
  const locale = useLocale();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<PhaseId>>(
    new Set(PHASE_GROUPS.map((g) => g.phase))
  );

  const { nodes, phaseRects, totalHeight } = useMemo(() => layoutModules(), []);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const moduleToPhase = useMemo(() => {
    const map = new Map<string, PhaseId>();
    for (const g of PHASE_GROUPS) {
      for (const m of g.modules) map.set(m.id, g.phase);
    }
    return map;
  }, []);

  const togglePhase = useCallback((phaseId: PhaseId) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  const relatedModules = useMemo(() => {
    const set = new Set<string>();
    if (hoveredModule) {
      set.add(hoveredModule);
      for (const dep of DEPENDENCIES) {
        if (dep.from === hoveredModule) set.add(dep.to);
        if (dep.to === hoveredModule) set.add(dep.from);
      }
    }
    return set;
  }, [hoveredModule]);

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

            const fromPhase = moduleToPhase.get(dep.from);
            const toPhase = moduleToPhase.get(dep.to);
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
            const nodePhase = moduleToPhase.get(node.id);
            if (nodePhase && !expandedPhases.has(nodePhase)) return null;

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
