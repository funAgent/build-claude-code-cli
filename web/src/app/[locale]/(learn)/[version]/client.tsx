"use client";

import { Tabs } from "@/components/ui/tabs";
import { useTranslations } from "@/lib/i18n";
import { useProgress } from "@/hooks/useProgress";
import { VERSION_META } from "@/lib/constants";

interface VersionDetailClientProps {
  version: string;
}

export function VersionDetailClient({ version }: VersionDetailClientProps) {
  const t = useTranslations("version");
  const { isCompleted, toggle } = useProgress();
  const meta = VERSION_META[version];
  const done = isCompleted(version);

  const tabs = [
    { id: "learn", label: t("tab_learn") },
    { id: "simulate", label: t("tab_simulate") },
    { id: "code", label: t("tab_code") },
    { id: "reference", label: t("tab_reference") },
    { id: "deep-dive", label: t("tab_deep_dive") },
  ];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} defaultTab="learn">
        {(activeTab) => (
          <>
            {activeTab === "learn" && (
              <div className="prose-custom">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-sm text-zinc-500">
                    {meta?.title} 教程内容即将上线
                  </p>
                  <p className="mt-2 text-xs text-zinc-400">
                    docs/zh/{version}.md
                  </p>
                </div>
              </div>
            )}
            {activeTab === "simulate" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">
                  Agent 循环模拟器即将上线
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  data/scenarios/{version}.json
                </p>
              </div>
            )}
            {activeTab === "code" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">
                  源码查看器即将上线
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  agents/{version}/src/
                </p>
              </div>
            )}
            {activeTab === "reference" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">
                  Claude Code 架构对照即将上线
                </p>
                <p className="mt-2 text-xs text-zinc-400">
                  {meta?.claudeCodeRef}
                </p>
              </div>
            )}
            {activeTab === "deep-dive" && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-sm text-zinc-500">
                  架构图 + 执行流 + 设计决策即将上线
                </p>
              </div>
            )}
          </>
        )}
      </Tabs>

      {/* Mark as completed */}
      <div className="flex justify-center">
        <button
          onClick={() => toggle(version)}
          className={
            done
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }
        >
          {done ? `✓ ${t("completed")}` : t("mark_complete")}
        </button>
      </div>
    </div>
  );
}
