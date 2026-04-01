import { cn } from "@/lib/utils";
import { PHASES, type PhaseId } from "@/lib/constants";

const PHASE_BADGE_COLORS: Record<PhaseId, string> = {
  preparation: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  "minimal-agent": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "tool-system": "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  "terminal-ui": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "prompt-engineering": "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "streaming-perf": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "context-mgmt": "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "agent-intelligence": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  security: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  ecosystem: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  "multi-agent": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  production: "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
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
