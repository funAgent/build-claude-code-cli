"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { FilePlus, FileCode, ChevronDown, ChevronRight } from "lucide-react";
import type { FileDiff } from "@/lib/diff";

type ViewMode = "source" | "diff";

export interface FileEntry {
  name: string;
  content: string;
  status: "added" | "modified" | "unchanged";
  diff?: FileDiff;
}

export function FileButton({ file, active, onClick }: { file: FileEntry; active: boolean; onClick: () => void }) {
  const Icon = file.status === "added" ? FilePlus : FileCode;
  const iconColor =
    file.status === "added" ? "text-emerald-500"
    : file.status === "modified" ? "text-amber-500"
    : "text-zinc-500";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-1.5 px-2 py-1 text-left font-mono text-[10px] transition-colors sm:text-[11px]",
        active
          ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white"
          : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
      )}
    >
      <Icon size={11} className={cn("shrink-0", iconColor)} />
      <span className="truncate">{file.name}</span>
      {file.status === "added" && (
        <span className="ml-auto shrink-0 rounded bg-emerald-500/15 px-1 text-[8px] font-semibold text-emerald-500">NEW</span>
      )}
      {file.status === "modified" && file.diff && (
        <span className="ml-auto shrink-0 text-[8px] text-zinc-400">
          <span className="text-emerald-500">+{file.diff.addCount}</span>
          {" "}
          <span className="text-red-500">-{file.diff.removeCount}</span>
        </span>
      )}
    </button>
  );
}

export function renderFileList(
  addedFiles: FileEntry[],
  modifiedFiles: FileEntry[],
  unchangedFiles: FileEntry[],
  allFiles: FileEntry[],
  visibleFiles: FileEntry[],
  activeIdx: number,
  hasPrev: boolean,
  viewMode: ViewMode,
  showUnchanged: boolean,
  setShowUnchanged: React.Dispatch<React.SetStateAction<boolean>>,
  onSelect: (idx: number) => void,
) {
  return (
    <>
      {addedFiles.length > 0 && (
        <div>
          <div className="px-2 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
            本课新增
          </div>
          {addedFiles.map((f) => {
            const idx = visibleFiles.indexOf(f);
            if (idx === -1) return null;
            return <FileButton key={f.name} file={f} active={activeIdx === idx} onClick={() => onSelect(idx)} />;
          })}
        </div>
      )}
      {modifiedFiles.length > 0 && (
        <div>
          <div className="px-2 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-amber-500">
            本课修改
          </div>
          {modifiedFiles.map((f) => {
            const idx = visibleFiles.indexOf(f);
            if (idx === -1) return null;
            return <FileButton key={f.name} file={f} active={activeIdx === idx} onClick={() => onSelect(idx)} />;
          })}
        </div>
      )}
      {viewMode === "source" && unchangedFiles.length > 0 && (
        <div>
          <button
            onClick={() => setShowUnchanged((p) => !p)}
            className="flex w-full items-center gap-1 px-2 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
          >
            {showUnchanged ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            未变更 ({unchangedFiles.length})
          </button>
          {showUnchanged && unchangedFiles.map((f) => {
            const idx = visibleFiles.indexOf(f);
            if (idx === -1) return null;
            return <FileButton key={f.name} file={f} active={activeIdx === idx} onClick={() => onSelect(idx)} />;
          })}
        </div>
      )}
      {!hasPrev && allFiles.map((f, i) => (
        <FileButton key={f.name} file={f} active={activeIdx === i} onClick={() => onSelect(i)} />
      ))}
    </>
  );
}
