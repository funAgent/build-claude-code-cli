"use client";

import { useTranslations } from "@/lib/i18n";
import { ArchMap } from "@/components/architecture/arch-map";

export default function ArchitecturePage() {
  const t = useTranslations("nav");

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("architecture")}</h1>
        <p className="text-[var(--color-text-secondary)]">
          Agent CLI 的完整模块组成 — 悬停查看关联课程，点击跳转
        </p>
      </header>

      <ArchMap />
    </div>
  );
}
