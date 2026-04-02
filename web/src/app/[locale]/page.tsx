"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "@/lib/i18n";
import { PHASES, VERSION_META } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress";
import { useProgress } from "@/hooks/useProgress";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";

const PHASE_BAR_COLORS: Record<string, string> = {
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

export default function HomePage() {
  const t = useTranslations("home");
  const tPhase = useTranslations("phase_labels");
  const tSession = useTranslations("sessions");
  const locale = useLocale();
  const { completedCount, totalCount, nextSession } = useProgress();

  return (
    <div className="flex flex-col pb-16">
      {/* Hero — split layout */}
      <section className="grid items-center gap-8 py-8 sm:py-16 lg:grid-cols-2 lg:gap-12">
        <div className="max-w-xl">
          <p className="text-sm font-semibold tracking-widest text-zinc-400 uppercase">
            Build Claude Code
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {t("hero_title")}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            {t("hero_subtitle")}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link
              href={`/${locale}/${nextSession ?? "s00"}`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {completedCount > 0 ? t("continue_learning") : t("start")}
              <span aria-hidden="true">&rarr;</span>
            </Link>
            <Link
              href={`/${locale}/architecture`}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--color-border)] px-6 py-3 text-sm font-medium transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              {t("view_all_sessions")}
            </Link>
          </div>
          {completedCount > 0 && (
            <div className="mt-6 w-full max-w-xs">
              <ProgressBar value={completedCount} max={totalCount} />
            </div>
          )}
        </div>

        {/* Code preview — replaces the old standalone Core Pattern section */}
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-zinc-500">agent.ts — {t("core_pattern")}</span>
          </div>
          <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
            <code>
              <span className="text-purple-400">while</span>
              <span className="text-zinc-300"> (</span>
              <span className="text-orange-300">true</span>
              <span className="text-zinc-300">) {"{"}</span>
              {"\n"}
              <span className="text-zinc-300">{"  "}response = </span>
              <span className="text-purple-400">await</span>
              <span className="text-zinc-300"> client.messages.</span>
              <span className="text-blue-400">create</span>
              <span className="text-zinc-500">({"{"}</span>
              <span className="text-zinc-300"> messages, tools </span>
              <span className="text-zinc-500">{"}"})</span>
              {"\n"}
              <span className="text-purple-400">{"  "}if</span>
              <span className="text-zinc-300"> (response.stop_reason !== </span>
              <span className="text-green-400">&quot;tool_use&quot;</span>
              <span className="text-zinc-300">) </span>
              <span className="text-purple-400">break</span>
              {"\n"}
              <span className="text-purple-400">{"  "}for</span>
              <span className="text-zinc-300"> (</span>
              <span className="text-purple-400">const</span>
              <span className="text-zinc-300"> toolCall </span>
              <span className="text-purple-400">of</span>
              <span className="text-zinc-300"> response.content) {"{"}</span>
              {"\n"}
              <span className="text-zinc-300">{"    "}result = </span>
              <span className="text-purple-400">await</span>
              <span className="text-zinc-300"> </span>
              <span className="text-blue-400">executeTool</span>
              <span className="text-zinc-500">(</span>
              <span className="text-zinc-300">toolCall.name, toolCall.input</span>
              <span className="text-zinc-500">)</span>
              {"\n"}
              <span className="text-zinc-300">{"    "}messages.</span>
              <span className="text-blue-400">push</span>
              <span className="text-zinc-500">(</span>
              <span className="text-zinc-300">result</span>
              <span className="text-zinc-500">)</span>
              {"\n"}
              <span className="text-zinc-300">{"  "}{"}"}</span>
              {"\n"}
              <span className="text-zinc-300">{"}"}</span>
            </code>
          </pre>
        </div>
      </section>

      {/* Learning Path — unified accordion replaces both Learning Path Preview + Phase Overview */}
      <section className="mt-16">
        <div className="mb-8">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("learning_path")}</h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            {t("learning_path_desc")}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {PHASES.map((phase, idx) => (
            <PhaseAccordion
              key={phase.id}
              phase={phase}
              locale={locale}
              tPhase={tPhase}
              tSession={tSession}
              t={t}
              defaultOpen={idx === 0}
            />
          ))}
        </div>

        <div className="mt-6">
          <Link
            href={`/${locale}/timeline`}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
          >
            {t("learn_more")} &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}

function PhaseAccordion({
  phase,
  locale,
  tPhase,
  tSession,
  t,
  defaultOpen = false,
}: {
  phase: (typeof PHASES)[number];
  locale: string;
  tPhase: (key: string) => string;
  tSession: (key: string) => string;
  t: (key: string) => string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-4 p-4 text-left"
        aria-expanded={open}
      >
        <div
          className={cn("h-full w-1.5 self-stretch rounded-full", PHASE_BAR_COLORS[phase.id])}
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
