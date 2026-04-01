"use client";

import { useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { VERSION_ORDER, VERSION_META } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";

export default function ComparePage() {
  const t = useTranslations("compare");
  const tSession = useTranslations("sessions");
  const [versionA, setVersionA] = useState("");
  const [versionB, setVersionB] = useState("");

  const metaA = versionA ? VERSION_META[versionA] : null;
  const metaB = versionB ? VERSION_META[versionB] : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-[var(--color-text-secondary)]">{t("subtitle")}</p>
      </header>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">{t("select_a")}</label>
          <select
            value={versionA}
            onChange={(e) => setVersionA(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">--</option>
            {VERSION_ORDER.map((v) => (
              <option key={v} value={v}>
                {v} - {tSession(v) || VERSION_META[v]?.title}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-zinc-500">{t("select_b")}</label>
          <select
            value={versionB}
            onChange={(e) => setVersionB(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">--</option>
            {VERSION_ORDER.map((v) => (
              <option key={v} value={v}>
                {v} - {tSession(v) || VERSION_META[v]?.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {metaA && metaB ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <PhaseBadge phase={metaA.phase}>{versionA}</PhaseBadge>
              <h3 className="mt-2 font-semibold">{metaA.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">{metaA.subtitle}</p>
              <div className="mt-2 text-xs text-zinc-400">
                ~{metaA.loc} LOC · {metaA.toolCount} tools
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <PhaseBadge phase={metaB.phase}>{versionB}</PhaseBadge>
              <h3 className="mt-2 font-semibold">{metaB.title}</h3>
              <p className="mt-1 text-xs text-zinc-500">{metaB.subtitle}</p>
              <div className="mt-2 text-xs text-zinc-400">
                ~{metaB.loc} LOC · {metaB.toolCount} tools
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-500">{t("loc_delta")}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {metaB.loc - metaA.loc > 0 ? "+" : ""}{metaB.loc - metaA.loc} {t("lines")}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">{t("empty_hint")}</p>
        </div>
      )}
    </div>
  );
}
