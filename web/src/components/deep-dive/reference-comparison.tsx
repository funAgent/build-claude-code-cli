"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ReferencePoint {
  concept: string;
  ourFile: string;
  ourLines: string;
  claudeCodeFile: string;
  claudeCodeConcept: string;
  difference: string;
  whyProduction: string;
}

export function ReferenceComparison({ points }: { points: ReferencePoint[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">架构对照</h3>

      {points.map((point, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2">
            <div className="border-b border-zinc-200 p-4 sm:border-b-0 sm:border-r dark:border-zinc-700">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-500">
                我们的实现
              </div>
              <div className="text-sm font-medium">{point.concept}</div>
              <div className="mt-1 font-mono text-xs text-zinc-500">
                {point.ourFile}:{point.ourLines}
              </div>
            </div>

            <div className="p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-purple-500">
                Claude Code
              </div>
              <div className="text-sm font-medium">{point.claudeCodeConcept}</div>
              <div className="mt-1 font-mono text-xs text-zinc-500">
                {point.claudeCodeFile}
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              <span className="font-medium text-zinc-800 dark:text-zinc-200">差异：</span>
              {point.difference}
            </p>
          </div>

          <button
            onClick={() => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }))}
            className="flex w-full items-center gap-1 border-t border-zinc-200 px-4 py-2 text-left text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <ChevronDown
              size={12}
              className={cn(
                "transition-transform",
                expanded[i] && "rotate-180"
              )}
            />
            生产版为什么这么做？
          </button>
          {expanded[i] && (
            <div className="border-t border-zinc-200 bg-blue-50 px-4 py-3 dark:border-zinc-700 dark:bg-blue-950/20">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                {point.whyProduction}
              </p>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
