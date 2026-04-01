"use client";

import { useTranslations } from "@/lib/i18n";

export default function ArchitecturePage() {
  const t = useTranslations("nav");

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("architecture")}</h1>
        <p className="text-[var(--color-text-secondary)]">
          可交互的系统架构全景图即将上线
        </p>
      </header>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto max-w-md">
          <p className="text-sm text-zinc-500">
            架构全景图将展示 Agent CLI 的完整模块组成，鼠标悬停模块可高亮关联课程，点击模块跳转到对应课程。
          </p>
          <p className="mt-4 text-xs text-zinc-400">
            components/architecture/arch-map.tsx
          </p>
        </div>
      </div>
    </div>
  );
}
