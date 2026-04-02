"use client";

import { useEffect, useState } from "react";

export function MermaidDiagram({ chart, id }: { chart: string; id: string }) {
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
      className="overflow-x-auto rounded-lg bg-white p-4 dark:bg-zinc-900 [&_svg]:mx-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
