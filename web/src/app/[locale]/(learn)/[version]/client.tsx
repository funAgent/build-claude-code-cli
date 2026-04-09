"use client";

import { useState, useCallback } from "react";
import confetti from "canvas-confetti";
import { Tabs } from "@/components/ui/tabs";
import { DocRenderer } from "@/components/docs/doc-renderer";
import { SourceViewer } from "@/components/code/source-viewer";
import { TerminalPlayer } from "@/components/terminal/terminal-player";
import { AnnotationViewer } from "@/components/deep-dive/annotation-viewer";
import { CelebrationOverlay } from "@/components/ui/celebration-overlay";
import { useTranslations } from "@/lib/i18n";
import { useProgress } from "@/hooks/useProgress";

interface VersionDetailClientProps {
  version: string;
}

export function VersionDetailClient({ version }: VersionDetailClientProps) {
  const t = useTranslations("version");
  const { isCompleted, toggle, completedCount, totalCount } = useProgress();
  const done = isCompleted(version);
  const [showCelebration, setShowCelebration] = useState(false);

  const handleToggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const wasCompleted = done;
      toggle(version);

      if (!wasCompleted) {
        const rect = e.currentTarget.getBoundingClientRect();
        confetti({
          particleCount: 60,
          spread: 55,
          origin: {
            x: (rect.left + rect.width / 2) / window.innerWidth,
            y: (rect.top + rect.height / 2) / window.innerHeight,
          },
          colors: ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0"],
          ticks: 120,
          gravity: 1.2,
        });

        if (completedCount + 1 >= totalCount) {
          setTimeout(() => setShowCelebration(true), 600);
        }
      }
    },
    [done, toggle, version, completedCount, totalCount]
  );

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
          onClick={handleToggle}
          className={
            done
              ? "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
              : "rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }
        >
          {done ? `✓ ${t("completed")}` : t("mark_complete")}
        </button>
      </div>

      {showCelebration && (
        <CelebrationOverlay onClose={() => setShowCelebration(false)} />
      )}
    </div>
  );
}
