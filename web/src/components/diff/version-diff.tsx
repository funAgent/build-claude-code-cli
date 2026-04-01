"use client";

import { useMemo } from "react";
import versionsData from "@/data/generated/versions.json";
import { VERSION_META } from "@/lib/constants";
import { computeFileDiffs } from "@/lib/diff";
import { WhatsNew } from "./whats-new";
import { CodeDiff } from "./code-diff";

interface VersionDiffProps {
  version: string;
}

export function VersionDiff({ version }: VersionDiffProps) {
  const meta = VERSION_META[version];
  const prevVersion = meta?.prevVersion;

  const diffs = useMemo(() => {
    if (!prevVersion) return null;

    const prevData = versionsData.versions.find((v) => v.id === prevVersion);
    const currData = versionsData.versions.find((v) => v.id === version);

    if (!prevData || !currData) return null;

    return computeFileDiffs(prevData.sourceFiles, currData.sourceFiles);
  }, [version, prevVersion]);

  if (!prevVersion) {
    const currData = versionsData.versions.find((v) => v.id === version);
    if (currData && currData.sourceFiles.length > 0) {
      const initialDiffs = computeFileDiffs([], currData.sourceFiles);
      return (
        <div className="space-y-6">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-900/20">
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {version}
            </span>{" "}
            是第一课，所有文件均为新增
          </div>
          <CodeDiff diffs={initialDiffs} />
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">该版本没有上一版本进行对比</p>
      </div>
    );
  }

  if (!diffs) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">源码数据加载中…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <WhatsNew version={version} prevVersion={prevVersion} diffs={diffs} />
      <CodeDiff diffs={diffs} />
    </div>
  );
}
