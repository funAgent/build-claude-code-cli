"use client";

import React, { useMemo, useState } from "react";
import versionsData from "@/data/generated/versions.json";
import { VERSION_META } from "@/lib/constants";
import { computeFileDiffs, type FileDiff, type DiffLine } from "@/lib/diff";
import { cn } from "@/lib/utils";
import { FilePlus, FileCode, ChevronDown, ChevronRight, FolderOpen } from "lucide-react";

interface SourceViewerProps {
  version: string;
}

type ViewMode = "source" | "diff";

interface FileEntry {
  name: string;
  content: string;
  status: "added" | "modified" | "unchanged";
  diff?: FileDiff;
}

// --- Syntax highlighting ---

const TS_KEYWORDS = new Set([
  "import", "export", "from", "const", "let", "var", "function", "return",
  "if", "else", "while", "for", "of", "in", "new", "class", "extends",
  "async", "await", "try", "catch", "throw", "switch", "case", "break",
  "continue", "default", "type", "interface", "typeof", "instanceof",
  "true", "false", "null", "undefined", "void", "this", "super",
]);

function highlightLine(line: string): React.ReactNode[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/**")) {
    return [<span key={0} className="text-zinc-500 italic">{line}</span>];
  }
  const parts = line.split(
    /(\b(?:import|export|from|const|let|var|function|return|if|else|while|for|of|in|new|class|extends|async|await|try|catch|throw|switch|case|break|continue|default|type|interface|typeof|instanceof|true|false|null|undefined|void|this|super)\b|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/.*$|\b\d+(?:\.\d+)?\b)/
  );
  return parts.map((part, idx) => {
    if (!part) return null;
    if (TS_KEYWORDS.has(part)) return <span key={idx} className="text-blue-400 font-medium">{part}</span>;
    if (part.startsWith("//")) return <span key={idx} className="text-zinc-500 italic">{part}</span>;
    if ((part.startsWith('"') && part.endsWith('"')) || (part.startsWith("'") && part.endsWith("'")) || (part.startsWith("`") && part.endsWith("`")))
      return <span key={idx} className="text-emerald-400">{part}</span>;
    if (/^\d+(?:\.\d+)?$/.test(part)) return <span key={idx} className="text-orange-400">{part}</span>;
    return <span key={idx}>{part}</span>;
  });
}

// --- Diff line renderer ---

function DiffLineRow({ line }: { line: DiffLine }) {
  const bg = line.type === "add" ? "bg-emerald-950/40" : line.type === "remove" ? "bg-red-950/40" : "";
  const text = line.type === "add" ? "text-emerald-300" : line.type === "remove" ? "text-red-300" : "text-zinc-400";
  const prefix = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
  return (
    <div className={cn("flex", bg)}>
      <span className="w-8 shrink-0 select-none px-1 text-right text-zinc-600">{line.oldLineNo ?? ""}</span>
      <span className="w-8 shrink-0 select-none px-1 text-right text-zinc-600">{line.newLineNo ?? ""}</span>
      <span className={cn("w-4 shrink-0 select-none text-center", text)}>{prefix}</span>
      <span className={cn("flex-1 whitespace-pre-wrap", text)}>{line.content}</span>
    </div>
  );
}

// --- Main component ---

export function SourceViewer({ version }: SourceViewerProps) {
  const meta = VERSION_META[version];
  const prevVersion = meta?.prevVersion ?? null;

  const { files, hasPrev } = useMemo(() => {
    const currData = versionsData.versions.find((v) => v.id === version);
    if (!currData || currData.sourceFiles.length === 0) {
      return { files: [] as FileEntry[], hasPrev: false };
    }

    if (!prevVersion) {
      return {
        files: currData.sourceFiles.map((f): FileEntry => ({
          name: f.name,
          content: f.content,
          status: "added",
        })),
        hasPrev: false,
      };
    }

    const prevData = versionsData.versions.find((v) => v.id === prevVersion);
    const diffs = prevData ? computeFileDiffs(prevData.sourceFiles, currData.sourceFiles) : [];
    const diffMap = new Map(diffs.map((d) => [d.name, d]));

    const entries: FileEntry[] = currData.sourceFiles.map((f) => {
      const diff = diffMap.get(f.name);
      let status: FileEntry["status"] = "unchanged";
      if (diff?.status === "added") status = "added";
      else if (diff?.status === "modified") status = "modified";
      return { name: f.name, content: f.content, status, diff };
    });

    entries.sort((a, b) => {
      const order = { added: 0, modified: 1, unchanged: 2 };
      return order[a.status] - order[b.status];
    });

    return { files: entries, hasPrev: true };
  }, [version, prevVersion]);

  const [viewMode, setViewMode] = useState<ViewMode>("source");
  const [activeFile, setActiveFile] = useState(0);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const addedFiles = files.filter((f) => f.status === "added");
  const modifiedFiles = files.filter((f) => f.status === "modified");
  const unchangedFiles = files.filter((f) => f.status === "unchanged");
  const changedFiles = [...addedFiles, ...modifiedFiles];

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">源码即将上线</p>
      </div>
    );
  }

  const visibleFiles = viewMode === "diff"
    ? changedFiles
    : [...changedFiles, ...(showUnchanged ? unchangedFiles : [])];

  const safeIndex = activeFile < visibleFiles.length ? activeFile : 0;
  const currentFile = visibleFiles[safeIndex];

  const changedLineSet = useMemo(() => {
    if (!currentFile?.diff || currentFile.status !== "modified") return null;
    const set = new Set<number>();
    for (const line of currentFile.diff.lines) {
      if (line.type === "add" && line.newLineNo) set.add(line.newLineNo);
    }
    return set;
  }, [currentFile]);

  return (
    <div className="space-y-3">
      {/* Segmented control */}
      {hasPrev && (
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
            <button
              onClick={() => { setViewMode("source"); setActiveFile(0); }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "source"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              本课源码
            </button>
            <button
              onClick={() => { setViewMode("diff"); setActiveFile(0); }}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                viewMode === "diff"
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}
            >
              与上课对比
            </button>
          </div>
          {viewMode === "diff" && changedFiles.length > 0 && (
            <span className="text-[10px] text-zinc-400">
              {addedFiles.length > 0 && <span className="text-emerald-500">+{addedFiles.length} 新增</span>}
              {addedFiles.length > 0 && modifiedFiles.length > 0 && "  "}
              {modifiedFiles.length > 0 && <span className="text-amber-500">{modifiedFiles.length} 修改</span>}
            </span>
          )}
        </div>
      )}

      {/* Editor chrome */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="hidden gap-1.5 sm:flex">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          </div>
          {/* Mobile file selector toggle */}
          <button
            onClick={() => setSidebarOpen((p) => !p)}
            className="flex items-center gap-1.5 sm:hidden"
            aria-expanded={sidebarOpen}
            aria-label="Toggle file list"
          >
            <FolderOpen size={14} className="text-zinc-400" />
            <span className="max-w-[180px] truncate font-mono text-[11px] font-medium text-zinc-300">
              {currentFile?.name ?? ""}
            </span>
            <ChevronDown size={12} className={cn("text-zinc-500 transition-transform", sidebarOpen && "rotate-180")} />
          </button>
          <span className="ml-1 hidden font-mono text-[10px] text-zinc-400 sm:inline">
            agents/{version}/src/
          </span>
          {currentFile && (
            <span className="ml-auto font-mono text-[10px] text-zinc-500 sm:hidden">
              {currentFile.status === "added" ? "NEW" : currentFile.status === "modified" ? "MOD" : ""}
            </span>
          )}
        </div>

        {/* Mobile file dropdown */}
        {sidebarOpen && (
          <div className="max-h-48 overflow-y-auto border-b border-zinc-200 bg-zinc-50 sm:hidden dark:border-zinc-700 dark:bg-zinc-900/80">
            {renderFileList(
              addedFiles, modifiedFiles, unchangedFiles, files,
              visibleFiles, safeIndex, hasPrev, viewMode,
              showUnchanged, setShowUnchanged,
              (idx) => { setActiveFile(idx); setSidebarOpen(false); }
            )}
          </div>
        )}

        <div className="flex">
          {/* Desktop file sidebar */}
          <div className="hidden w-52 shrink-0 overflow-y-auto border-r border-zinc-200 bg-zinc-50/50 sm:block dark:border-zinc-700 dark:bg-zinc-900/50">
            {renderFileList(
              addedFiles, modifiedFiles, unchangedFiles, files,
              visibleFiles, safeIndex, hasPrev, viewMode,
              showUnchanged, setShowUnchanged,
              (idx) => setActiveFile(idx)
            )}
          </div>

          {/* Code area */}
          <div className="min-w-0 flex-1 overflow-x-auto bg-zinc-950">
            {currentFile && viewMode === "diff" && currentFile.diff && currentFile.diff.lines.length > 0 ? (
              <pre className="p-0 text-[10px] leading-4 sm:text-xs sm:leading-5">
                <code>
                  {currentFile.diff.lines.map((line, i) => (
                    <DiffLineRow key={i} line={line} />
                  ))}
                </code>
              </pre>
            ) : currentFile ? (
              <pre className="p-2 text-[10px] leading-4 sm:p-4 sm:text-xs sm:leading-5">
                <code>
                  {currentFile.content.split("\n").map((line, i) => {
                    const lineNo = i + 1;
                    const isChanged = changedLineSet?.has(lineNo);
                    return (
                      <div key={i} className={cn("flex", isChanged && "border-l-2 border-amber-400/60 bg-amber-950/15")}>
                        <span className="mr-2 inline-block w-6 shrink-0 select-none text-right text-zinc-600 sm:mr-4 sm:w-8">
                          {lineNo}
                        </span>
                        <span className="text-zinc-200">{highlightLine(line)}</span>
                      </div>
                    );
                  })}
                </code>
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Shared file list renderer (used by both desktop sidebar and mobile dropdown) ---

function renderFileList(
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

// --- File sidebar button ---

function FileButton({ file, active, onClick }: { file: FileEntry; active: boolean; onClick: () => void }) {
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
