export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import {
  AlertCircle,
  GitCompare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { analyzeContentGap } from "@/app/content-gap/actions";

export default async function PerClientContentGapPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const t = await getTranslations("keywordsTab.contentGap");
  const locale = await getLocale();

  const result = await analyzeContentGap({ clientId });

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      <PageHeader
        title={t("title", { name: client.name })}
        description={t("description")}
        icon={GitCompare}
        accent="cyan"
      />

      {!result.ok ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mr-2 inline size-4" />
          {result.error}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              label={t("tiles.tracked")}
              value={result.ourQueries.length}
              tone="violet"
            />
            <Tile
              label={t("tiles.gap")}
              value={result.gapKeywords.length}
              tone="rose"
              hint={t("tiles.gapHint")}
            />
            <Tile
              label={t("tiles.winning")}
              value={result.sharedKeywords.length}
              tone="emerald"
              hint={t("tiles.winningHint")}
            />
          </div>

          {result.gapKeywords.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="size-4 text-rose-300" />
                  {t("gap.title", { count: result.gapKeywords.length })}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("gap.body")}
                </p>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">{t("col.query")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("col.impressions")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("col.clicks")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("col.ctr")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("col.position")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {result.gapKeywords.slice(0, 50).map((k) => (
                    <tr key={k.query} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-2 font-medium">{k.query}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {k.impressions.toLocaleString(locale)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {k.clicks}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-300">
                        {(k.ctr * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                        {k.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {result.sharedKeywords.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TrendingUp className="size-4 text-emerald-300" />
                  {t("winning.title", { count: result.sharedKeywords.length })}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("winning.body")}
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.sharedKeywords.map((k) => (
                  <li
                    key={k.query}
                    className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                  >
                    <span className="font-medium">{k.query}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-300 tabular-nums">
                        #{k.position.toFixed(1)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {t("winning.ctr", { value: (k.ctr * 100).toFixed(1) })}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {t("winning.clicks", { count: k.clicks })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "violet" | "emerald" | "rose";
  hint?: string;
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    rose: "text-gradient-rose",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
