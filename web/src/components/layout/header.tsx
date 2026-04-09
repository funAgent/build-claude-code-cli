"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations, useLocale } from "@/lib/i18n";
import { Github, Menu, X, Sun, Moon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";

const NAV_ITEMS = [
  { key: "timeline", href: "/timeline" },
  { key: "guide", href: "/guide" },
  { key: "architecture", href: "/architecture" },
] as const;

const LOCALES = [
  { code: "zh", label: "中文" },
  { code: "en", label: "EN" },
];

export function Header() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const locale = useLocale();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { dark, mounted, toggleDark } = useTheme();

  function isActive(href: string) {
    const fullPath = `/${locale}${href}`;
    return pathname === fullPath || pathname.startsWith(fullPath + "/");
  }

  function switchLocale(newLocale: string) {
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    window.location.href = newPath;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-bold">
          <img
            src="/logo.svg"
            width={24}
            height={24}
            alt=""
            aria-hidden="true"
            className="shrink-0 dark:invert"
          />
          <span className="hidden sm:inline">Build Claude Code</span>
          <span className="sm:hidden">BCC</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={`/${locale}${item.href}`}
              className={cn(
                "text-sm font-medium transition-colors hover:text-zinc-900 dark:hover:text-white",
                isActive(item.href)
                  ? "text-zinc-900 dark:text-white"
                  : "text-zinc-500 dark:text-zinc-400"
              )}
              aria-current={isActive(item.href) ? "page" : undefined}
            >
              {t(item.key)}
            </Link>
          ))}

          <div
            className="flex items-center gap-1 rounded-lg border border-[var(--color-border)] p-0.5"
            role="group"
            aria-label={locale === "zh" ? "语言切换" : "Language"}
          >
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => switchLocale(l.code)}
                aria-pressed={locale === l.code}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  locale === l.code
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>

          <button
            onClick={toggleDark}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-md p-1.5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-white"
          >
            {mounted ? (dark ? <Sun size={16} /> : <Moon size={16} />) : <span className="inline-block h-4 w-4" />}
          </button>

          <a
            href="https://github.com/funAgent/build-claude-code-cli"
            target="_blank"
            rel="noopener"
            aria-label="GitHub repository"
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-white"
          >
            <Github size={18} />
          </a>
        </nav>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center md:hidden"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <nav
          className="border-t border-[var(--color-border)] bg-[var(--color-bg)] p-4 md:hidden"
          aria-label="Mobile navigation"
        >
          <Link
            href={`/${locale}`}
            className={cn(
              "flex min-h-[44px] items-center text-sm font-medium",
              pathname === `/${locale}` || pathname === `/${locale}/`
                ? "text-zinc-900 dark:text-white"
                : "text-zinc-500"
            )}
            onClick={() => setMobileOpen(false)}
          >
            {t("home")}
          </Link>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={`/${locale}${item.href}`}
              className={cn(
                "flex min-h-[44px] items-center text-sm",
                isActive(item.href)
                  ? "font-medium text-zinc-900 dark:text-white"
                  : "text-zinc-500"
              )}
              onClick={() => setMobileOpen(false)}
            >
              {t(item.key)}
            </Link>
          ))}
          <div className="mt-3 flex items-center justify-between border-t border-[var(--color-border)] pt-3">
            <div className="flex gap-2" role="group" aria-label="Language">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => switchLocale(l.code)}
                  aria-pressed={locale === l.code}
                  className={cn(
                    "min-h-[44px] min-w-[44px] rounded-md px-3 text-xs font-medium",
                    locale === l.code
                      ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                      : "border border-[var(--color-border)]"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleDark}
                aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-white"
              >
                {mounted ? (dark ? <Sun size={18} /> : <Moon size={18} />) : <span className="inline-block h-[18px] w-[18px]" />}
              </button>
              <a
                href="https://github.com/funAgent/build-claude-code-cli"
                target="_blank"
                rel="noopener"
                aria-label="GitHub repository"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-white"
              >
                <Github size={18} />
              </a>
            </div>
          </div>
        </nav>
      )}
    </header>
  );
}
