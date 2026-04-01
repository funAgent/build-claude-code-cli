"use client";

import { Tabs } from "@/components/ui/tabs";
import { DocRenderer } from "@/components/docs/doc-renderer";
import { SourceViewer } from "@/components/code/source-viewer";
import { TerminalPlayer } from "@/components/terminal/terminal-player";
import { AnnotationViewer } from "@/components/deep-dive/annotation-viewer";
import { useTranslations } from "@/lib/i18n";
import { useProgress } from "@/hooks/useProgress";

interface VersionDetailClientProps {
  version: string;
}

export function VersionDetailClient({ version }: VersionDetailClientProps) {
  const t = useTranslations("version");
  const { isCompleted, toggle } = useProgress();
  const done = isCompleted(version);

  const tabs = [
    { id: "learn", label: t("tab_learn") },
    { id: "simulate", label: t("tab_simulate") },
    { id: "code", label: t("tab_code") },
    { id: "deep-dive", label: t("tab_deep_dive") },
  ];

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} defaultTab="learn">
        {(activeTab) => (
          <>
            {activeTab === "learn" && <DocRenderer version={version} />}
            {activeTab === "simulate" && (
              <TerminalPlayer version={version} />
            )}
            {activeTab === "code" && <SourceViewer version={version} />}
            {activeTab === "deep-dive" && (
              <AnnotationViewer version={version} />
            )}
          </>
        )}
      </Tabs>

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
