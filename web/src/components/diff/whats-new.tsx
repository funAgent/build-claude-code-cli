"use client";

import type { FileDiff } from "@/lib/diff";
import { VERSION_META } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";
import { FilePlus, FileCode, ArrowRight } from "lucide-react";

interface WhatsNewProps {
  version: string;
  prevVersion: string;
  diffs: FileDiff[];
}

export function WhatsNew({ version, prevVersion, diffs }: WhatsNewProps) {
  const meta = VERSION_META[version];
  const prevMeta = VERSION_META[prevVersion];

  const added = diffs.filter((d) => d.status === "added");
  const modified = diffs.filter((d) => d.status === "modified");
  const totalAdded = diffs.reduce((s, d) => s + d.addCount, 0);
  const totalRemoved = diffs.reduce((s, d) => s + d.removeCount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2">
          <PhaseBadge phase={prevMeta?.phase ?? "preparation"}>{prevVersion}</PhaseBadge>
          <span className="font-medium text-zinc-500">{prevMeta?.title}</span>
        </div>
        <ArrowRight size={14} className="text-zinc-400" />
        <div className="flex items-center gap-2">
          <PhaseBadge phase={meta?.phase ?? "preparation"}>{version}</PhaseBadge>
          <span className="font-medium">{meta?.title}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-lg font-bold tabular-nums text-emerald-500">+{totalAdded}</p>
          <p className="text-[10px] text-zinc-500">新增行</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-lg font-bold tabular-nums text-red-500">-{totalRemoved}</p>
          <p className="text-[10px] text-zinc-500">删除行</p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="text-lg font-bold tabular-nums">{added.length + modified.length}</p>
          <p className="text-[10px] text-zinc-500">变更文件</p>
        </div>
      </div>

      {meta?.coreAddition && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <p className="text-xs font-medium text-blue-600 dark:text-blue-400">核心新增</p>
          <p className="mt-1 text-sm">{meta.coreAddition}</p>
        </div>
      )}

      {added.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">新增文件</p>
          <div className="space-y-1">
            {added.map((f) => (
              <div key={f.name} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                <FilePlus size={12} className="text-emerald-500" />
                <span className="font-mono">{f.name}</span>
                <span className="ml-auto text-emerald-500">+{f.addCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {modified.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium text-zinc-500">修改文件</p>
          <div className="space-y-1">
            {modified.map((f) => (
              <div key={f.name} className="flex items-center gap-2 rounded px-2 py-1 text-xs">
                <FileCode size={12} className="text-amber-500" />
                <span className="font-mono">{f.name}</span>
                <span className="ml-auto">
                  <span className="text-emerald-500">+{f.addCount}</span>
                  {" "}
                  <span className="text-red-500">-{f.removeCount}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
