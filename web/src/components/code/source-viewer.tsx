"use client";

import { useMemo, useState } from "react";
import versionsData from "@/data/generated/versions.json";
import { cn } from "@/lib/utils";

interface SourceViewerProps {
  version: string;
}

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
    if (TS_KEYWORDS.has(part)) {
      return <span key={idx} className="text-blue-400 font-medium">{part}</span>;
    }
    if (part.startsWith("//")) {
      return <span key={idx} className="text-zinc-500 italic">{part}</span>;
    }
    if (
      (part.startsWith('"') && part.endsWith('"')) ||
      (part.startsWith("'") && part.endsWith("'")) ||
      (part.startsWith("`") && part.endsWith("`"))
    ) {
      return <span key={idx} className="text-emerald-400">{part}</span>;
    }
    if (/^\d+(?:\.\d+)?$/.test(part)) {
      return <span key={idx} className="text-orange-400">{part}</span>;
    }
    return <span key={idx}>{part}</span>;
  });
}

export function SourceViewer({ version }: SourceViewerProps) {
  const versionData = useMemo(
    () => versionsData.versions.find((v) => v.id === version),
    [version]
  );

  const [activeFile, setActiveFile] = useState(0);

  if (!versionData || versionData.sourceFiles.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">源码即将上线</p>
      </div>
    );
  }

  const currentFile = versionData.sourceFiles[activeFile];
  const lines = currentFile.content.split("\n");

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-yellow-400" />
          <span className="h-3 w-3 rounded-full bg-green-400" />
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {versionData.sourceFiles.map((f, i) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(i)}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-xs transition-colors",
                i === activeFile
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto bg-zinc-950">
        <pre className="p-2 text-[10px] leading-4 sm:p-4 sm:text-xs sm:leading-5">
          <code>
            {lines.map((line, i) => (
              <div key={i} className="flex">
                <span className="mr-2 inline-block w-6 shrink-0 select-none text-right text-zinc-600 sm:mr-4 sm:w-8">
                  {i + 1}
                </span>
                <span className="text-zinc-200">{highlightLine(line)}</span>
              </div>
            ))}
          </code>
        </pre>
      </div>
    </div>
  );
}
