import { cn } from "@/lib/utils";
import { PHASES, type PhaseId } from "@/lib/constants";

const PHASE_BADGE_COLORS: Record<PhaseId, string> = {
  preparation: "bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400",
  "minimal-agent": "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "tool-system": "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "terminal-ui": "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "prompt-engineering": "bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  "streaming-perf": "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "context-mgmt": "bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "agent-intelligence": "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  security: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  ecosystem: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  "multi-agent": "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  production: "bg-lime-50 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
};

interface PhaseBadgeProps {
  phase: PhaseId;
  children: React.ReactNode;
  className?: string;
}

export function PhaseBadge({ phase, children, className }: PhaseBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        PHASE_BADGE_COLORS[phase],
        className
      )}
    >
      {children}
    </span>
  );
}

export function getPhaseColor(phaseId: PhaseId): string {
  return PHASES.find((p) => p.id === phaseId)?.color ?? "#6B7280";
}
