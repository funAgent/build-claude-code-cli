import type { Metadata } from "next";
import { I18nProvider } from "@/lib/i18n";
import { Header } from "@/components/layout/header";
import zh from "@/i18n/messages/zh.json";
import en from "@/i18n/messages/en.json";
import "../globals.css";

const SITE_URL = "https://build.funagent.app";
const locales = ["zh", "en"];
const metaMessages: Record<string, typeof zh> = { zh, en };

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const messages = metaMessages[locale] || metaMessages.zh;
  const title = messages.meta?.title || "Build Claude Code";
  const description =
    messages.meta?.description || "从零构建企业级 AI Agent CLI";
  const url = `${SITE_URL}/${locale}/`;
  const altLocale = locale === "zh" ? "en" : "zh";

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: url,
      languages: { [altLocale]: `${SITE_URL}/${altLocale}/` },
    },
    icons: [
      { rel: "icon", type: "image/png", sizes: "32x32", url: "/favicon.png" },
      { rel: "icon", type: "image/svg+xml", url: "/favicon.svg" },
    ],
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "Build Claude Code",
      locale: locale === "zh" ? "zh_CN" : "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
    keywords:
      locale === "zh"
        ? [
            "Claude Code",
            "AI Agent",
            "CLI",
            "TypeScript",
            "Anthropic",
            "AI 编程",
            "Agent 开发教程",
          ]
        : [
            "Claude Code",
            "AI Agent",
            "CLI",
            "TypeScript",
            "Anthropic",
            "AI coding",
            "Agent tutorial",
          ],
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <html lang={locale} suppressHydrationWarning className="font-sans">
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-D20Z4J6G62" />
        <script dangerouslySetInnerHTML={{ __html: `
          window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-D20Z4J6G62');
        `}} />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var theme = localStorage.getItem('theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          })();
        `}} />
      </head>
      <body className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <I18nProvider locale={locale}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-zinc-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white dark:focus:bg-white dark:focus:text-zinc-900"
          >
            Skip to main content
          </a>
          <Header />
          <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            {children}
          </main>
        </I18nProvider>
      </body>
    </html>
  );
}
