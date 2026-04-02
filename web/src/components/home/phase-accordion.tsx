"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { VERSION_META, PHASE_BG_CLASS, type PhaseDefinition } from "@/lib/constants";

interface PhaseAccordionProps {
  phase: PhaseDefinition;
  locale: string;
  tPhase: (key: string) => string;
  tSession: (key: string) => string;
  t: (key: string) => string;
  defaultOpen?: boolean;
}

export function PhaseAccordion({
  phase,
  locale,
  tPhase,
  tSession,
  t,
  defaultOpen = false,
}: PhaseAccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 p-4 text-left"
        aria-expanded={open}
      >
        <div
          className={cn("h-full w-1.5 self-stretch rounded-full", PHASE_BG_CLASS[phase.id])}
          style={{ minHeight: 24 }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{tPhase(phase.id)}</h3>
            <span className="text-xs text-[var(--color-text-secondary)]">
              {phase.sessions.length} {t("sessions_in_phase")}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] truncate">
            {phase.description}
          </p>
        </div>
        <ChevronRight
          size={16}
          className={cn(
            "shrink-0 text-zinc-400 transition-transform duration-200",
            open && "rotate-90"
          )}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {phase.sessions.map((vId) => {
              const meta = VERSION_META[vId];
              if (!meta) return null;
              return (
                <Link
                  key={vId}
                  href={`/${locale}/${vId}`}
                  className="group flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs font-medium dark:bg-zinc-800">
                    {vId}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium group-hover:underline">
                      {tSession(vId) || meta.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] line-clamp-2">
                      {meta.keyInsight}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
