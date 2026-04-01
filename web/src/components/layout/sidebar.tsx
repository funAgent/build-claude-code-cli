"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { PHASES, VERSION_META } from "@/lib/constants";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useProgress } from "@/hooks/useProgress";

const PHASE_DOT_COLORS: Record<string, string> = {
  preparation: "bg-gray-500",
  "minimal-agent": "bg-blue-500",
  "tool-system": "bg-emerald-500",
  "terminal-ui": "bg-purple-500",
  "prompt-engineering": "bg-pink-500",
  "streaming-perf": "bg-amber-500",
  "context-mgmt": "bg-teal-500",
  "agent-intelligence": "bg-indigo-500",
  security: "bg-red-500",
  ecosystem: "bg-cyan-500",
  "multi-agent": "bg-orange-500",
  production: "bg-lime-500",
};

export function Sidebar() {
  const pathname = usePathname();
  const locale = pathname.split("/")[1] || "zh";
  const t = useTranslations("sessions");
  const tPhase = useTranslations("phase_labels");
  const { isCompleted } = useProgress();

  const currentSession = pathname.split("/").find((seg) => /^s\d{2}$/.test(seg));
  const currentPhaseId = currentSession
    ? PHASES.find((p) => p.sessions.includes(currentSession))?.id
    : undefined;

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (currentPhaseId) {
      setExpanded((prev) => ({ ...prev, [currentPhaseId]: true }));
    }
  }, [currentPhaseId]);

  function togglePhase(phaseId: string) {
    setExpanded((prev) => ({ ...prev, [phaseId]: !prev[phaseId] }));
  }

  return (
    <nav className="hidden w-60 shrink-0 md:block">
      <div className="sticky top-[calc(3.5rem+2rem)] max-h-[calc(100vh-6rem)] space-y-1 overflow-y-auto pr-2">
        {PHASES.map((phase) => {
          const isOpen = expanded[phase.id] ?? false;
          const completedCount = phase.sessions.filter((s) => isCompleted(s)).length;
          const totalCount = phase.sessions.length;

          return (
            <div key={phase.id}>
              <button
                onClick={() => togglePhase(phase.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <ChevronRight
                  size={14}
                  className={cn(
                    "shrink-0 text-zinc-400 transition-transform duration-200",
                    isOpen && "rotate-90"
                  )}
                />
                <span className={cn("h-2 w-2 shrink-0 rounded-full", PHASE_DOT_COLORS[phase.id])} />
                <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {tPhase(phase.id)}
                </span>
                <span className="text-[10px] tabular-nums text-zinc-400 dark:text-zinc-600">
                  {completedCount}/{totalCount}
                </span>
              </button>

              {isOpen && (
                <ul className="ml-4 space-y-0.5 pb-1 pt-0.5">
                  {phase.sessions.map((vId) => {
                    const meta = VERSION_META[vId];
                    const href = `/${locale}/${vId}`;
                    const isActive =
                      pathname === href ||
                      pathname === `${href}/` ||
                      pathname.startsWith(`${href}/diff`);
                    const done = isCompleted(vId);

                    return (
                      <li key={vId}>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                            isActive
                              ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white"
                              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-300"
                          )}
                        >
                          <span className="w-4 shrink-0 text-center text-xs">
                            {done ? (
                              <span className="text-emerald-500">&#10003;</span>
                            ) : isActive ? (
                              <span className="text-blue-500">&rarr;</span>
                            ) : (
                              <span className="text-zinc-300 dark:text-zinc-600">&#9675;</span>
                            )}
                          </span>
                          <span className="font-mono text-xs text-zinc-400">{vId}</span>
                          <span className="ml-0.5 truncate">{t(vId) || meta?.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
