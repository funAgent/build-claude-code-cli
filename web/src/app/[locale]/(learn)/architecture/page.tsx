"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "@/lib/i18n";
import { ArchMap } from "@/components/architecture/arch-map";
import { PHASES, VERSION_META } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const PHASE_BG_COLORS: Record<string, string> = {
  preparation: "bg-gray-500/10 border-gray-500/20",
  "minimal-agent": "bg-blue-500/10 border-blue-500/20",
  "tool-system": "bg-emerald-500/10 border-emerald-500/20",
  "terminal-ui": "bg-purple-500/10 border-purple-500/20",
  "prompt-engineering": "bg-pink-500/10 border-pink-500/20",
  "streaming-perf": "bg-amber-500/10 border-amber-500/20",
  "context-mgmt": "bg-teal-500/10 border-teal-500/20",
  "agent-intelligence": "bg-indigo-500/10 border-indigo-500/20",
  security: "bg-red-500/10 border-red-500/20",
  ecosystem: "bg-cyan-500/10 border-cyan-500/20",
  "multi-agent": "bg-orange-500/10 border-orange-500/20",
  production: "bg-lime-500/10 border-lime-500/20",
};

type Tab = "map" | "layers";

export default function ArchitecturePage() {
  const t = useTranslations("architecture");
  const tPhase = useTranslations("phase_labels");
  const tSession = useTranslations("sessions");
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>("map");

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-[var(--color-text-secondary)]">{t("subtitle")}</p>
      </header>

      {/* Tab bar */}
      <div
        className="flex gap-1 rounded-lg border border-[var(--color-border)] p-1 w-fit"
        role="tablist"
        aria-label="Architecture views"
      >
        {(["map", "layers"] as const).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-white"
            )}
          >
            {t(`tab_${id}`)}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === "map" && (
        <div role="tabpanel">
          <ArchMap />
        </div>
      )}

      {tab === "layers" && (
        <div role="tabpanel" className="grid gap-4">
          {PHASES.map((phase) => (
            <div
              key={phase.id}
              className={cn("rounded-xl border p-5", PHASE_BG_COLORS[phase.id])}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: phase.color }}
                />
                <h2 className="text-base font-semibold">{tPhase(phase.id)}</h2>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {phase.sessions.length} lessons
                </span>
              </div>
              <p className="ml-7 mt-1 text-sm text-[var(--color-text-secondary)]">
                {phase.description}
              </p>
              <div className="ml-7 mt-3 flex flex-wrap gap-1.5">
                {phase.sessions.map((vid) => {
                  const meta = VERSION_META[vid];
                  return (
                    <Link key={vid} href={`/${locale}/${vid}`}>
                      <PhaseBadge
                        phase={phase.id}
                        className="cursor-pointer transition-opacity hover:opacity-80"
                      >
                        {vid}: {tSession(vid) || meta?.title}
                      </PhaseBadge>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
