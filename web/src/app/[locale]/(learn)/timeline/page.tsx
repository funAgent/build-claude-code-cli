"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "@/lib/i18n";
import { PHASES, VERSION_META } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";
import { useProgress } from "@/hooks/useProgress";
import { cn } from "@/lib/utils";

const PHASE_LINE_COLORS: Record<string, string> = {
  preparation: "border-gray-400",
  "minimal-agent": "border-blue-400",
  "tool-system": "border-emerald-400",
  "terminal-ui": "border-purple-400",
  "prompt-engineering": "border-pink-400",
  "streaming-perf": "border-amber-400",
  "context-mgmt": "border-teal-400",
  "agent-intelligence": "border-indigo-400",
  security: "border-red-400",
  ecosystem: "border-cyan-400",
  "multi-agent": "border-orange-400",
  production: "border-lime-400",
};

const PHASE_DOT_BG: Record<string, string> = {
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

export default function TimelinePage() {
  const t = useTranslations("timeline");
  const tSession = useTranslations("sessions");
  const tPhase = useTranslations("phase_labels");
  const locale = useLocale();
  const { isCompleted } = useProgress();

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-[var(--color-text-secondary)]">{t("subtitle")}</p>
      </header>

      <div className="space-y-8">
        {PHASES.map((phase) => (
          <div key={phase.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("h-3 w-3 rounded-full", PHASE_DOT_BG[phase.id])} />
              <h2 className="text-lg font-semibold">{tPhase(phase.id)}</h2>
              <span className="text-xs text-[var(--color-text-secondary)]">
                {phase.sessions.length} {t("learn_more")}
              </span>
            </div>

            <div className={cn("ml-1.5 space-y-0 border-l-2 pl-6", PHASE_LINE_COLORS[phase.id])}>
              {phase.sessions.map((vId) => {
                const meta = VERSION_META[vId];
                const done = isCompleted(vId);
                return (
                  <Link
                    key={vId}
                    href={`/${locale}/${vId}`}
                    className="group relative block py-3"
                  >
                    <div className={cn(
                      "absolute -left-[1.9rem] top-4 h-3 w-3 rounded-full border-2 border-white dark:border-zinc-900",
                      done ? "bg-emerald-500" : PHASE_DOT_BG[phase.id]
                    )} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <PhaseBadge phase={meta?.phase ?? "preparation"}>
                            {vId}
                          </PhaseBadge>
                          <span className="text-sm font-semibold group-hover:underline">
                            {tSession(vId) || meta?.title}
                          </span>
                          {done && <span className="text-xs text-emerald-500">&#10003;</span>}
                        </div>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {meta?.keyInsight}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
                        ~{meta?.loc} LOC
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
