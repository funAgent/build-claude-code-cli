"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface DesignDecision {
  title: string;
  question: string;
  options: { name: string; pros: string; cons: string }[];
  chosen: string;
  reason: string;
}

interface ReferencePoint {
  concept: string;
  ourFile: string;
  ourLines: string;
  claudeCodeFile: string;
  claudeCodeConcept: string;
  difference: string;
  whyProduction: string;
}

interface AnnotationData {
  version: string;
  architecture: {
    title: string;
    description: string;
    mermaid: string;
  };
  designDecisions: DesignDecision[];
  reference: ReferencePoint[];
}

const annotationModules: Record<string, () => Promise<{ default: AnnotationData }>> = {
  s00: () => import("@/data/annotations/s00.json") as Promise<{ default: AnnotationData }>,
  s01: () => import("@/data/annotations/s01.json") as Promise<{ default: AnnotationData }>,
  s02: () => import("@/data/annotations/s02.json") as Promise<{ default: AnnotationData }>,
  s03: () => import("@/data/annotations/s03.json") as Promise<{ default: AnnotationData }>,
  s04: () => import("@/data/annotations/s04.json") as Promise<{ default: AnnotationData }>,
  s05: () => import("@/data/annotations/s05.json") as Promise<{ default: AnnotationData }>,
  s06: () => import("@/data/annotations/s06.json") as Promise<{ default: AnnotationData }>,
  s07: () => import("@/data/annotations/s07.json") as Promise<{ default: AnnotationData }>,
  s08: () => import("@/data/annotations/s08.json") as Promise<{ default: AnnotationData }>,
  s09: () => import("@/data/annotations/s09.json") as Promise<{ default: AnnotationData }>,
  s10: () => import("@/data/annotations/s10.json") as Promise<{ default: AnnotationData }>,
  s11: () => import("@/data/annotations/s11.json") as Promise<{ default: AnnotationData }>,
  s12: () => import("@/data/annotations/s12.json") as Promise<{ default: AnnotationData }>,
  s13: () => import("@/data/annotations/s13.json") as Promise<{ default: AnnotationData }>,
  s14: () => import("@/data/annotations/s14.json") as Promise<{ default: AnnotationData }>,
  s15: () => import("@/data/annotations/s15.json") as Promise<{ default: AnnotationData }>,
  s16: () => import("@/data/annotations/s16.json") as Promise<{ default: AnnotationData }>,
  s17: () => import("@/data/annotations/s17.json") as Promise<{ default: AnnotationData }>,
  s18: () => import("@/data/annotations/s18.json") as Promise<{ default: AnnotationData }>,
  s19: () => import("@/data/annotations/s19.json") as Promise<{ default: AnnotationData }>,
  s20: () => import("@/data/annotations/s20.json") as Promise<{ default: AnnotationData }>,
  s21: () => import("@/data/annotations/s21.json") as Promise<{ default: AnnotationData }>,
  s22: () => import("@/data/annotations/s22.json") as Promise<{ default: AnnotationData }>,
  s23: () => import("@/data/annotations/s23.json") as Promise<{ default: AnnotationData }>,
  s24: () => import("@/data/annotations/s24.json") as Promise<{ default: AnnotationData }>,
  s25: () => import("@/data/annotations/s25.json") as Promise<{ default: AnnotationData }>,
  s26: () => import("@/data/annotations/s26.json") as Promise<{ default: AnnotationData }>,
  s27: () => import("@/data/annotations/s27.json") as Promise<{ default: AnnotationData }>,
  s28: () => import("@/data/annotations/s28.json") as Promise<{ default: AnnotationData }>,
  s29: () => import("@/data/annotations/s29.json") as Promise<{ default: AnnotationData }>,
  s30: () => import("@/data/annotations/s30.json") as Promise<{ default: AnnotationData }>,
  s31: () => import("@/data/annotations/s31.json") as Promise<{ default: AnnotationData }>,
  s32: () => import("@/data/annotations/s32.json") as Promise<{ default: AnnotationData }>,
  s33: () => import("@/data/annotations/s33.json") as Promise<{ default: AnnotationData }>,
  s34: () => import("@/data/annotations/s34.json") as Promise<{ default: AnnotationData }>,
};

function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        });
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Mermaid render failed");
      }
    }
    render();
    return () => { cancelled = true; };
  }, [chart, id]);

  if (error) {
    return (
      <pre className="overflow-x-auto rounded-md bg-red-50 p-4 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-400">
        {error}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-white" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="overflow-x-auto rounded-lg bg-white p-4 dark:bg-zinc-900 [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function ArchitectureDiagram({ data, version }: { data: AnnotationData["architecture"]; version: string }) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">{data.title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)]">{data.description}</p>
      <MermaidDiagram chart={data.mermaid} id={version} />
    </section>
  );
}

function DesignDecisions({ decisions }: { decisions: DesignDecision[] }) {
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

function ReferenceComparison({ points }: { points: ReferencePoint[] }) {
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

interface AnnotationViewerProps {
  version: string;
}

export function AnnotationViewer({ version }: AnnotationViewerProps) {
  const [data, setData] = useState<AnnotationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loader = annotationModules[version];
    if (loader) {
      loader().then((mod) => {
        setData(mod.default);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [version]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-white" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">该课程的深入分析即将上线</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ArchitectureDiagram data={data.architecture} version={version} />
      <DesignDecisions decisions={data.designDecisions} />
      {data.reference && data.reference.length > 0 && (
        <ReferenceComparison points={data.reference} />
      )}
    </div>
  );
}
