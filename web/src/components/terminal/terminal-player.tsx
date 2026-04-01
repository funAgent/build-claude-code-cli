"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, RotateCcw, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalStep {
  type: "prompt" | "input" | "output";
  text: string;
  typeDelay?: number;
  charDelay?: number;
  color?: string;
}

interface TerminalRecording {
  version: string;
  title: string;
  steps: TerminalStep[];
}

const COLOR_MAP: Record<string, string> = {
  white:   "text-zinc-200",
  cyan:    "text-cyan-400",
  gray:    "text-zinc-500",
  yellow:  "text-yellow-400",
  red:     "text-red-400",
  green:   "text-emerald-400",
  blue:    "text-blue-400",
  magenta: "text-purple-400",
};

const recordingModules: Record<string, () => Promise<{ default: TerminalRecording }>> = {
  s00: () => import("@/data/terminal-recordings/s00.json") as Promise<{ default: TerminalRecording }>,
  s01: () => import("@/data/terminal-recordings/s01.json") as Promise<{ default: TerminalRecording }>,
  s02: () => import("@/data/terminal-recordings/s02.json") as Promise<{ default: TerminalRecording }>,
  s03: () => import("@/data/terminal-recordings/s03.json") as Promise<{ default: TerminalRecording }>,
  s04: () => import("@/data/terminal-recordings/s04.json") as Promise<{ default: TerminalRecording }>,
  s05: () => import("@/data/terminal-recordings/s05.json") as Promise<{ default: TerminalRecording }>,
  s06: () => import("@/data/terminal-recordings/s06.json") as Promise<{ default: TerminalRecording }>,
  s07: () => import("@/data/terminal-recordings/s07.json") as Promise<{ default: TerminalRecording }>,
  s08: () => import("@/data/terminal-recordings/s08.json") as Promise<{ default: TerminalRecording }>,
  s09: () => import("@/data/terminal-recordings/s09.json") as Promise<{ default: TerminalRecording }>,
  s10: () => import("@/data/terminal-recordings/s10.json") as Promise<{ default: TerminalRecording }>,
  s11: () => import("@/data/terminal-recordings/s11.json") as Promise<{ default: TerminalRecording }>,
  s12: () => import("@/data/terminal-recordings/s12.json") as Promise<{ default: TerminalRecording }>,
  s13: () => import("@/data/terminal-recordings/s13.json") as Promise<{ default: TerminalRecording }>,
  s14: () => import("@/data/terminal-recordings/s14.json") as Promise<{ default: TerminalRecording }>,
  s15: () => import("@/data/terminal-recordings/s15.json") as Promise<{ default: TerminalRecording }>,
  s16: () => import("@/data/terminal-recordings/s16.json") as Promise<{ default: TerminalRecording }>,
  s17: () => import("@/data/terminal-recordings/s17.json") as Promise<{ default: TerminalRecording }>,
  s18: () => import("@/data/terminal-recordings/s18.json") as Promise<{ default: TerminalRecording }>,
  s19: () => import("@/data/terminal-recordings/s19.json") as Promise<{ default: TerminalRecording }>,
  s20: () => import("@/data/terminal-recordings/s20.json") as Promise<{ default: TerminalRecording }>,
  s21: () => import("@/data/terminal-recordings/s21.json") as Promise<{ default: TerminalRecording }>,
  s22: () => import("@/data/terminal-recordings/s22.json") as Promise<{ default: TerminalRecording }>,
  s23: () => import("@/data/terminal-recordings/s23.json") as Promise<{ default: TerminalRecording }>,
};

interface RenderedChunk {
  text: string;
  color: string;
}

interface TerminalPlayerProps {
  version: string;
}

export function TerminalPlayer({ version }: TerminalPlayerProps) {
  const [recording, setRecording] = useState<TerminalRecording | null>(null);
  const [chunks, setChunks] = useState<RenderedChunk[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [speed, setSpeed] = useState(1);

  const termRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(false);
  const playingRef = useRef(false);

  useEffect(() => {
    const loader = recordingModules[version];
    if (loader) {
      loader().then((mod) => setRecording(mod.default));
    }
  }, [version]);

  const scrollToBottom = useCallback(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, []);

  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(resolve, ms / speed);
        const check = setInterval(() => {
          if (cancelRef.current) {
            clearTimeout(id);
            clearInterval(check);
            resolve();
          }
        }, 50);
      }),
    [speed]
  );

  const playRecording = useCallback(async () => {
    if (!recording || playingRef.current) return;

    playingRef.current = true;
    cancelRef.current = false;
    setIsPlaying(true);
    setIsComplete(false);
    setChunks([]);

    for (const step of recording.steps) {
      if (cancelRef.current) break;

      if (step.type === "prompt") {
        setChunks((prev) => [...prev, { text: step.text + " ", color: "text-emerald-400" }]);
        scrollToBottom();
        await sleep(200);
      } else if (step.type === "input") {
        const delay = step.typeDelay ?? 40;
        for (const char of step.text) {
          if (cancelRef.current) break;
          setChunks((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.color === "text-white") {
              return [...prev.slice(0, -1), { text: last.text + char, color: "text-white" }];
            }
            return [...prev, { text: char, color: "text-white" }];
          });
          scrollToBottom();
          await sleep(delay);
        }
        setChunks((prev) => [...prev, { text: "\n", color: "text-white" }]);
        await sleep(100);
      } else if (step.type === "output") {
        const colorClass = COLOR_MAP[step.color ?? "white"] ?? "text-zinc-200";

        if (step.charDelay && step.charDelay > 0) {
          for (const char of step.text) {
            if (cancelRef.current) break;
            setChunks((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.color === colorClass) {
                return [...prev.slice(0, -1), { text: last.text + char, color: colorClass }];
              }
              return [...prev, { text: char, color: colorClass }];
            });
            scrollToBottom();
            await sleep(step.charDelay);
          }
        } else {
          setChunks((prev) => [...prev, { text: step.text, color: colorClass }]);
          scrollToBottom();
          await sleep(50);
        }
      }
    }

    playingRef.current = false;
    setIsPlaying(false);
    setIsComplete(true);
  }, [recording, sleep, scrollToBottom]);

  const handleReset = useCallback(() => {
    cancelRef.current = true;
    playingRef.current = false;
    setChunks([]);
    setIsPlaying(false);
    setIsComplete(false);
    setTimeout(() => {
      cancelRef.current = false;
    }, 100);
  }, []);

  const handleCopy = useCallback(() => {
    if (!recording) return;
    const commands = recording.steps
      .filter((s) => s.type === "input")
      .map((s) => s.text)
      .join("\n");
    navigator.clipboard.writeText(commands);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [recording]);

  if (!recording) return null;

  return (
    <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-100 px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-400" />
            <span className="h-3 w-3 rounded-full bg-yellow-400" />
            <span className="h-3 w-3 rounded-full bg-green-400" />
          </div>
          <span className="font-mono text-xs text-zinc-500">
            {recording.title} — 终端预览
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Speed */}
          <div className="flex items-center gap-1">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  speed === s
                    ? "bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Controls */}
          {!isPlaying ? (
            <button
              onClick={playRecording}
              disabled={isPlaying}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              title="播放"
            >
              <Play size={12} />
            </button>
          ) : (
            <button
              onClick={() => {
                cancelRef.current = true;
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-600 text-white transition-colors hover:bg-zinc-700"
              title="暂停"
            >
              <Pause size={12} />
            </button>
          )}
          <button
            onClick={handleReset}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 transition-colors hover:bg-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-700"
            title="重置"
          >
            <RotateCcw size={12} />
          </button>
          <button
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 text-zinc-500 transition-colors hover:bg-zinc-200 dark:border-zinc-600 dark:hover:bg-zinc-700"
            title="复制命令"
          >
            {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div
        ref={termRef}
        className="max-h-[300px] min-h-[120px] overflow-y-auto bg-zinc-950 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap"
      >
        {chunks.length === 0 && !isPlaying && (
          <span className="text-zinc-600">点击 ▶ 播放终端演示</span>
        )}
        {chunks.map((chunk, i) => (
          <span key={i} className={chunk.color}>
            {chunk.text}
          </span>
        ))}
        {isPlaying && (
          <span className="inline-block h-4 w-2 animate-pulse bg-zinc-400" />
        )}
      </div>
    </div>
  );
}
