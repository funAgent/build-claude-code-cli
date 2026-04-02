"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DesignDecision {
  title: string;
  question: string;
  options: { name: string; pros: string; cons: string }[];
  chosen: string;
  reason: string;
}

export function DesignDecisions({ decisions }: { decisions: DesignDecision[] }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">设计决策</h3>

      {decisions.map((decision, i) => (
        <div
          key={i}
          className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
        >
          <button
            onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))}
            className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <Circle size={8} className="shrink-0 text-blue-500" />
            <span className="flex-1 text-sm font-medium">{decision.title}</span>
            <ChevronDown
              size={16}
              className={cn(
                "shrink-0 text-zinc-400 transition-transform",
                expanded[i] && "rotate-180"
              )}
            />
          </button>

          <AnimatePresence>
            {expanded[i] && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-700">
                  <p className="mb-3 text-sm font-medium text-[var(--color-text-secondary)]">
                    {decision.question}
                  </p>

                  <div className="mb-3 space-y-2">
                    {decision.options.map((opt) => (
                      <div
                        key={opt.name}
                        className={cn(
                          "rounded-md border p-2.5",
                          opt.name === decision.chosen
                            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/20"
                            : "border-zinc-200 dark:border-zinc-700"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">
                            {opt.name}
                          </span>
                          {opt.name === decision.chosen && (
                            <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200">
                              ✓ 采用
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex gap-4 text-xs text-[var(--color-text-secondary)]">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            + {opt.pros}
                          </span>
                          <span className="text-red-500 dark:text-red-400">
                            − {opt.cons}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-md bg-blue-50 p-2.5 dark:bg-blue-950/20">
                    <p className="text-xs text-blue-800 dark:text-blue-300">
                      <span className="font-semibold">为什么：</span>
                      {decision.reason}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </section>
  );
}
