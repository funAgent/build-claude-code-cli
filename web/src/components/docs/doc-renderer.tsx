"use client";

import { useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import docsData from "@/data/generated/docs.json";
import { TermTip } from "./term-tip";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";

interface DocRendererProps {
  version: string;
}

function renderMarkdown(md: string): string {
  const result = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeHighlight, { detect: false, ignoreMissing: true })
    .use(rehypeStringify)
    .processSync(md);
  return String(result);
}

function postProcessHtml(html: string): string {
  html = html.replace(
    /<pre><code class="hljs language-(\w+)">/g,
    '<pre class="code-block" data-language="$1"><code class="hljs language-$1">'
  );

  html = html.replace(
    /<pre><code(?! class="hljs)([^>]*)>([\s\S]*?)<\/code><\/pre>/g,
    (_match, attrs, content) => {
      return `<pre class="code-plain"><code${attrs}>${content}</code></pre>`;
    }
  );

  html = html.replace(/<blockquote>/, '<blockquote class="hero-callout">');

  html = html.replace(/<h1>.*?<\/h1>\n?/, "");

  html = html.replace(
    /<ol start="(\d+)">/g,
    (_, start) => `<ol style="counter-reset:step-counter ${parseInt(start) - 1}">`
  );

  return html;
}

export function DocRenderer({ version }: DocRendererProps) {
  const locale = useLocale();

  const doc = useMemo(() => {
    const match = docsData.find(
      (d: { version: string; locale: string }) =>
        d.version === version && d.locale === locale
    );
    if (match) return match;
    return docsData.find(
      (d: { version: string; locale: string }) =>
        d.version === version && d.locale === "zh"
    );
  }, [version, locale]);

  if (!doc) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm text-zinc-500">教程文档即将上线</p>
      </div>
    );
  }

  const html = useMemo(() => {
    const raw = renderMarkdown(doc.content);
    return postProcessHtml(raw);
  }, [doc.content]);

  return (
    <div>
      <TermTip>
        <div
          className="prose-custom"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </TermTip>
    </div>
  );
}
