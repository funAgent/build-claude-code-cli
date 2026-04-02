import { redirect } from "next/navigation";

export function generateStaticParams() {
  return [{ locale: "zh" }, { locale: "en" }];
}

export default async function LayersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/architecture`);
}
