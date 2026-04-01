"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "@/lib/i18n";
import { LEARNING_PATH, VERSION_META, PHASES } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { useProgress } from "@/hooks/useProgress";
import { cn } from "@/lib/utils";

const PHASE_BORDER_COLORS: Record<string, string> = {
  preparation: "border-gray-500/30 hover:border-gray-500/60",
  "minimal-agent": "border-blue-500/30 hover:border-blue-500/60",
  "tool-system": "border-emerald-500/30 hover:border-emerald-500/60",
  "terminal-ui": "border-purple-500/30 hover:border-purple-500/60",
  "prompt-engineering": "border-pink-500/30 hover:border-pink-500/60",
  "streaming-perf": "border-amber-500/30 hover:border-amber-500/60",
  "context-mgmt": "border-teal-500/30 hover:border-teal-500/60",
  "agent-intelligence": "border-indigo-500/30 hover:border-indigo-500/60",
  security: "border-red-500/30 hover:border-red-500/60",
  ecosystem: "border-cyan-500/30 hover:border-cyan-500/60",
  "multi-agent": "border-orange-500/30 hover:border-orange-500/60",
  production: "border-lime-500/30 hover:border-lime-500/60",
};

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
  const locale = useLocale();
  const { completedCount, totalCount, nextSession } = useProgress();

  return (
    <div className="flex flex-col gap-20 pb-16">
      {/* Hero */}
      <section className="flex flex-col items-center px-2 pt-8 text-center sm:pt-20">
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          {t("hero_title")}
        </h1>
        <p className="mt-4 max-w-2xl text-base text-[var(--color-text-secondary)] sm:text-xl">
          {t("hero_subtitle")}
        </p>
        <div className="mt-8 flex items-center gap-4">
          <Link
            href={`/${locale}/${nextSession ?? "s00"}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {completedCount > 0 ? t("continue_learning") : t("start")}
            <span aria-hidden="true">&rarr;</span>
          </Link>
        </div>
        {completedCount > 0 && (
          <div className="mt-4 w-full max-w-xs">
            <ProgressBar value={completedCount} max={totalCount} />
          </div>
        )}
      </section>

      {/* Core Pattern */}
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("core_pattern")}</h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            {t("core_pattern_desc")}
          </p>
        </div>
        <div className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
            <span className="h-3 w-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-xs text-zinc-500">agent.ts</span>
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

      {/* Learning Path Preview */}
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("learning_path")}</h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            {t("learning_path_desc")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LEARNING_PATH.slice(0, 12).map((versionId) => {
            const meta = VERSION_META[versionId];
            if (!meta) return null;
            return (
              <Link
                key={versionId}
                href={`/${locale}/${versionId}`}
                className="group block"
              >
                <Card
                  className={cn(
                    "h-full border transition-all duration-200",
                    PHASE_BORDER_COLORS[meta.phase]
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <PhaseBadge phase={meta.phase}>{versionId}</PhaseBadge>
                    <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">
                      ~{meta.loc} {t("loc")}
                    </span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold group-hover:underline">
                    {meta.title}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {meta.keyInsight}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <Link
            href={`/${locale}/timeline`}
            className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
          >
            {t("learn_more")} &rarr;
          </Link>
        </div>
      </section>

      {/* Phase Overview */}
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">{t("phases_title")}</h2>
          <p className="mt-2 text-[var(--color-text-secondary)]">
            {t("phases_desc")}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {PHASES.map((phase) => (
            <div
              key={phase.id}
              className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4"
            >
              <div
                className={cn(
                  "h-full w-1.5 self-stretch rounded-full",
                  PHASE_BAR_COLORS[phase.id]
                )}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{tPhase(phase.id)}</h3>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {phase.sessions.length} {t("sessions_in_phase")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {phase.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {phase.sessions.map((vid) => {
                    const meta = VERSION_META[vid];
                    return (
                      <Link key={vid} href={`/${locale}/${vid}`}>
                        <PhaseBadge
                          phase={phase.id}
                          className="cursor-pointer transition-opacity hover:opacity-80"
                        >
                          {vid}: {meta?.title}
                        </PhaseBadge>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
