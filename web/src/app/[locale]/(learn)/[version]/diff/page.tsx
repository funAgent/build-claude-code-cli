import Link from "next/link";
import { LEARNING_PATH, VERSION_META, PHASES } from "@/lib/constants";
import { PhaseBadge } from "@/components/ui/badge";
import { VersionDiff } from "@/components/diff/version-diff";
import { getTranslations } from "@/lib/i18n-server";

export function generateStaticParams() {
  return LEARNING_PATH.map((version) => ({ version }));
}

export default async function DiffPage({
  params,
}: {
  params: Promise<{ locale: string; version: string }>;
}) {
  const { locale, version } = await params;
  const meta = VERSION_META[version];

  if (!meta) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-bold">Version not found</h1>
        <p className="mt-2 text-zinc-500">{version}</p>
      </div>
    );
  }

  const t = getTranslations(locale, "version");
  const tSession = getTranslations(locale, "sessions");
  const phase = PHASES.find((p) => p.id === meta.phase);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/${version}`}
            className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
          >
            &larr; {tSession(version) || meta.title}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-zinc-100 px-3 py-1 font-mono text-lg font-bold dark:bg-zinc-800">
            {version}
          </span>
          <h1 className="text-xl font-bold sm:text-2xl">{t("view_diff")}</h1>
          {phase && (
            <PhaseBadge phase={meta.phase}>{phase.label}</PhaseBadge>
          )}
        </div>
      </header>

      <VersionDiff version={version} />
    </div>
  );
}
