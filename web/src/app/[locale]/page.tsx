"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "@/lib/i18n";
import { PHASES } from "@/lib/constants";
import { ProgressBar } from "@/components/ui/progress";
import { useProgress } from "@/hooks/useProgress";
import { PhaseAccordion } from "@/components/home/phase-accordion";

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

        {/* Code preview */}
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

      {/* Learning Path */}
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
