"use client";

import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useLocale, useTranslations } from "@/lib/i18n";
import guidesData from "@/data/generated/guides.json";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import { TermTip } from "@/components/docs/term-tip";
import { cn } from "@/lib/utils";

interface TocItem {
  id: string;
  text: string;
  level: number;
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

function postProcessGuideHtml(html: string): string {
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

  html = html.replace(/<blockquote>\s*<p><strong>架构洞察[：:]<\/strong>/g,
    '<blockquote class="callout-insight"><p><strong>架构洞察：</strong>'
  );

  html = html.replace(/<h1>.*?<\/h1>\n?/, "");

  const headingIdCounts = new Map<string, number>();
  const headingRegex = /<(h[23])\b[^>]*>(.*?)<\/\1>/g;
  html = html.replace(headingRegex, (_match, tag, text) => {
    const plainText = text.replace(/<[^>]+>/g, "");
    let id = plainText
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "");
    const count = headingIdCounts.get(id) ?? 0;
    headingIdCounts.set(id, count + 1);
    if (count > 0) id = `${id}-${count}`;
    return `<${tag} id="${id}">${text}</${tag}>`;
  });

  html = html.replace(
    /href="\/zh\/(s\d{2})"/g,
    (_, sId) => `href="/${typeof window !== 'undefined' ? (document.documentElement.lang || 'zh') : 'zh'}/${sId}"`
  );

  return html;
}

function extractToc(md: string): TocItem[] {
  const lines = md.split("\n");
  const toc: TocItem[] = [];
  const idCounts = new Map<string, number>();
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{2,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].replace(/\{#[\w-]+\}/g, "").trim();
      let id = text
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fff]+/g, "-")
        .replace(/^-|-$/g, "");
      const count = idCounts.get(id) ?? 0;
      idCounts.set(id, count + 1);
      if (count > 0) id = `${id}-${count}`;
      toc.push({ id, text, level });
    }
  }

  return toc;
}

const HEADER_OFFSET = 80;

export default function GuidePage() {
  const locale = useLocale();
  const t = useTranslations("guide");
  const [activeId, setActiveId] = useState<string>("");
  const tocNavRef = useRef<HTMLUListElement>(null);

  const guide = useMemo(() => {
    const match = (guidesData as { locale: string; title: string; content: string }[]).find(
      (g) => g.locale === locale
    );
    if (match) return match;
    return (guidesData as { locale: string; title: string; content: string }[]).find(
      (g) => g.locale === "zh"
    );
  }, [locale]);

  const toc = useMemo(() => {
    if (!guide) return [];
    return extractToc(guide.content);
  }, [guide]);

  const html = useMemo(() => {
    if (!guide) return "";
    const raw = renderMarkdown(guide.content);
    return postProcessGuideHtml(raw);
  }, [guide]);

  useEffect(() => {
    if (toc.length === 0) return;

    const headingEls = toc
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    if (headingEls.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: `-${HEADER_OFFSET}px 0px -60% 0px`,
        threshold: 0,
      }
    );

    headingEls.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc]);

  useEffect(() => {
    if (!activeId || !tocNavRef.current) return;
    const activeEl = tocNavRef.current.querySelector(`a[href="#${activeId}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [activeId]);

  const handleTocClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
      setActiveId(id);
      history.replaceState(null, "", `#${id}`);
    }
  }, []);

  if (!guide) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500">{t("coming_soon")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="mx-auto mb-8 max-w-3xl space-y-2 xl:max-w-[69rem]">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-[var(--color-text-secondary)]">{t("subtitle")}</p>
      </header>

      <div className="relative mx-auto max-w-3xl xl:flex xl:max-w-[69rem] xl:gap-10">
        <article className="min-w-0 xl:flex-1 xl:max-w-3xl">
          <TermTip>
            <div
              className="prose-custom prose-guide"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </TermTip>
        </article>

        <nav
          className="hidden w-72 shrink-0 xl:block"
          aria-label="Table of contents"
        >
          <div className="sticky top-22 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {t("toc")}
            </p>
            <ul
              ref={tocNavRef}
              className="space-y-0.5 border-l border-zinc-200 dark:border-zinc-800"
            >
              {toc.map((item) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    onClick={(e) => handleTocClick(e, item.id)}
                    className={cn(
                      "block whitespace-nowrap border-l-2 py-1 text-sm transition-colors",
                      item.level === 2 ? "pl-4 font-medium" : "pl-7 text-xs",
                      activeId === item.id
                        ? "border-blue-500 text-zinc-900 dark:border-blue-400 dark:text-white"
                        : "border-transparent text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                    )}
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </>
  );
}
