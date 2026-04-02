"use client";

import { useEffect, useState } from "react";
import { loadAnnotation } from "@/lib/session-loader";
import { MermaidDiagram } from "./mermaid-diagram";
import { DesignDecisions, type DesignDecision } from "./design-decisions";
import { ReferenceComparison, type ReferencePoint } from "./reference-comparison";

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

function ArchitectureDiagram({ data, version }: { data: AnnotationData["architecture"]; version: string }) {
  return (
    <section className="space-y-4">
      <h3 className="text-lg font-semibold">{data.title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)]">{data.description}</p>
      <MermaidDiagram chart={data.mermaid} id={version} />
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
    loadAnnotation<AnnotationData>(version)
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
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
