"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { FileDiff, DiffLine } from "@/lib/diff";
import { ChevronDown, ChevronRight, FilePlus, FileX, FileCode } from "lucide-react";

interface CodeDiffProps {
  diffs: FileDiff[];
}

const STATUS_CONFIG = {
  added: { label: "新增", icon: FilePlus, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  removed: { label: "删除", icon: FileX, color: "text-red-500", bg: "bg-red-500/10" },
  modified: { label: "修改", icon: FileCode, color: "text-amber-500", bg: "bg-amber-500/10" },
  unchanged: { label: "未变", icon: FileCode, color: "text-zinc-400", bg: "bg-zinc-500/10" },
};

function DiffFileBlock({ diff }: { diff: FileDiff }) {
  const [expanded, setExpanded] = useState(diff.status !== "unchanged");
  const config = STATUS_CONFIG[diff.status];
  const Icon = config.icon;

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={14} className={config.color} />
        <span className="font-mono text-xs font-medium">{diff.name}</span>
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", config.bg, config.color)}>
          {config.label}
        </span>
        {diff.addCount > 0 && (
          <span className="text-[10px] font-medium text-emerald-500">+{diff.addCount}</span>
        )}
        {diff.removeCount > 0 && (
          <span className="text-[10px] font-medium text-red-500">-{diff.removeCount}</span>
        )}
      </button>

      {expanded && diff.lines.length > 0 && (
        <div className="overflow-x-auto border-t border-zinc-200 bg-zinc-950 dark:border-zinc-700">
          <pre className="p-0 text-[10px] leading-4 sm:text-xs sm:leading-5">
            <code>
              {diff.lines.map((line, i) => (
                <DiffLineRow key={i} line={line} />
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const bgClass =
    line.type === "add"
      ? "bg-emerald-950/40"
      : line.type === "remove"
        ? "bg-red-950/40"
        : "";

  const textClass =
    line.type === "add"
      ? "text-emerald-300"
      : line.type === "remove"
        ? "text-red-300"
        : "text-zinc-400";

  const prefix =
    line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  return (
    <div className={cn("flex", bgClass)}>
      <span className="w-8 shrink-0 select-none px-1 text-right text-zinc-600">
        {line.oldLineNo ?? ""}
      </span>
      <span className="w-8 shrink-0 select-none px-1 text-right text-zinc-600">
        {line.newLineNo ?? ""}
      </span>
      <span className={cn("w-4 shrink-0 select-none text-center", textClass)}>
        {prefix}
      </span>
      <span className={cn("flex-1 whitespace-pre-wrap", textClass)}>
        {line.content}
      </span>
    </div>
  );
}

export function CodeDiff({ diffs }: CodeDiffProps) {
  const activeDiffs = useMemo(
    () => diffs.filter((d) => d.status !== "unchanged"),
    [diffs]
  );

  if (activeDiffs.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">没有代码变更</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {activeDiffs.map((diff) => (
        <DiffFileBlock key={diff.name} diff={diff} />
      ))}
    </div>
  );
}
