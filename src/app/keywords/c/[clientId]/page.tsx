export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, asc, inArray } from "drizzle-orm";
import { Search, X, Camera, Activity } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { ResearchForm } from "@/app/keywords/research-form";
import { CsvImportExport } from "@/app/keywords/import-form";
import { CheckRankButton, CheckAllRanksButton } from "@/app/keywords/rank-buttons";
import { ScanSerpButton } from "@/app/keywords/serp-button";
import { untrackKeyword } from "@/app/keywords/actions";
import { clientScope } from "@/lib/client-scope";
import {
  ConnectGscNudge,
  RankSourceBadge,
} from "@/components/ui/rank-source-badge";
import { NeedsConnection } from "@/components/ui/needs-connection";
import { RankSparkline } from "./rank-sparkline";

const deviceTone: Record<string, string> = {
  desktop: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  mobile: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
};

function PositionBadge({ position }: { position: number | null | undefined }) {
  if (position === null || position === undefined) {
    return (
      <span className="inline-flex h-7 w-12 items-center justify-center rounded-lg bg-white/5 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
        —
      </span>
    );
  }
  let tone = "bg-rose-500/10 ring-rose-500/30 text-gradient-rose";
  if (position <= 3) tone = "bg-emerald-500/10 ring-emerald-500/30 text-gradient-emerald";
  else if (position <= 10) tone = "bg-amber-500/10 ring-amber-500/30 text-gradient-amber";
  else if (position <= 20) tone = "bg-cyan-500/10 ring-cyan-500/30 text-gradient-cyan";
  return (
    <span
      className={`inline-flex h-7 w-12 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ${tone}`}
    >
      #{position}
    </span>
  );
}

async function SerpFeaturePills({
  hasAiOverview,
  hasFeaturedSnippet,
  hasLocalPack,
  paaCount,
}: {
  hasAiOverview: boolean;
  hasFeaturedSnippet: boolean;
  hasLocalPack: boolean;
  paaCount: number;
}) {
  const t = await getTranslations("keywords");
  const any = hasAiOverview || hasFeaturedSnippet || hasLocalPack || paaCount > 0;
  if (!any) {
    return (
      <span className="text-[11px] text-muted-foreground/50">
        {t("runSerpScan")}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {hasAiOverview && (
        <span
          title={t("aioTitle")}
          className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-300 ring-1 ring-inset ring-violet-500/30"
        >
          AIO
        </span>
      )}
      {hasFeaturedSnippet && (
        <span
          title={t("fsTitle")}
          className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30"
        >
          FS
        </span>
      )}
      {hasLocalPack && (
        <span
          title={t("lpTitle")}
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-500/30"
        >
          LP
        </span>
      )}
      {paaCount > 0 && (
        <span
          title={t("paaTitle", { count: paaCount })}
          className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300 ring-1 ring-inset ring-cyan-500/30"
        >
          PAA·{paaCount}
        </span>
      )}
    </div>
  );
}

export default async function PerClientKeywordsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const t = await getTranslations("keywords");
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const tracked = await db
    .select()
    .from(keywords)
    .where(eq(keywords.clientId, clientId))
    .orderBy(desc(keywords.createdAt));

  const ranks =
    tracked.length === 0
      ? []
      : await db
          .select()
          .from(keywordRankings)
          .where(
            inArray(
              keywordRankings.keywordId,
              tracked.map((k) => k.id),
            ),
          )
          .orderBy(keywordRankings.checkedAt);

  const ranksByKeyword = new Map<
    number,
    {
      position: number | null;
      url: string | null;
      checkedAt: Date;
      hasAiOverview: boolean;
      hasFeaturedSnippet: boolean;
      hasLocalPack: boolean;
      paaCount: number;
      source: "scrape" | "gsc";
      impressions: number | null;
      dataDate: string | null;
    }[]
  >();
  for (const r of ranks) {
    const list = ranksByKeyword.get(r.keywordId) ?? [];
    list.push({
      position: r.position,
      url: r.url,
      checkedAt: r.checkedAt,
      hasAiOverview: !!r.hasAiOverview,
      hasFeaturedSnippet: !!r.hasFeaturedSnippet,
      hasLocalPack: !!r.hasLocalPack,
      paaCount: r.paaCount ?? 0,
      source: r.source,
      impressions: r.impressions,
      dataDate: r.dataDate,
    });
    ranksByKeyword.set(r.keywordId, list);
  }

  // Quick wins
  type Keyword = (typeof tracked)[number];
  const quickWins: { keyword: Keyword; position: number; url: string | null }[] = [];
  for (const trackedKw of tracked) {
    const history = ranksByKeyword.get(trackedKw.id) ?? [];
    if (history.length === 0) continue;
    const latest = history[history.length - 1];
    if (latest.position !== null && latest.position >= 4 && latest.position <= 15) {
      quickWins.push({
        keyword: trackedKw,
        position: latest.position,
        url: latest.url,
      });
    }
  }
  quickWins.sort((a, b) => a.position - b.position);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/keywords/c"
        toolLabel={t("toolLabel")}
        icon={Search}
      />

      <PageHeader
        title={t("clientTitle", { name: client.name })}
        description={
          client.gscProperty
            ? t("clientDescriptionGsc")
            : t("clientDescriptionBrowser")
        }
        icon={Search}
        accent="cyan"
        actions={
          tracked.length > 0 ? (
            <Link
              href={`/keywords/export.csv?clientId=${client.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
            >
              {t("exportCsv")}
            </Link>
          ) : undefined
        }
      />

      <ResearchForm clients={[{ id: client.id, name: client.name }]} />
      <CsvImportExport clients={[{ id: client.id, name: client.name }]} />

      {quickWins.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/15 blur-3xl" />
          <header className="relative border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Activity className="size-4 text-amber-300" />
              {t("quickWinsTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("quickWinsDescription")}
            </p>
          </header>
          <ul className="relative divide-y divide-white/[0.04]">
            {quickWins.map((q) => (
              <li
                key={q.keyword.id}
                className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-white/[0.02]"
              >
                <span className="font-mono text-base font-semibold text-amber-300 tabular-nums">
                  #{q.position}
                </span>
                <span className="font-medium">{q.keyword.query}</span>
                {q.url && (
                  <a
                    href={q.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto truncate text-xs text-muted-foreground hover:text-foreground"
                  >
                    {q.url.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tracked.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          {t("emptyTracked")}
        </div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">
                {t("trackedTitle", { count: tracked.length })}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {client.gscProperty
                  ? t("trackedHintGsc")
                  : t("trackedHintBrowser")}
              </p>
            </div>
            <CheckAllRanksButton />
          </header>
          {!client.gscProperty && (
            <div className="space-y-2 border-b border-white/5 px-5 py-3">
              <ConnectGscNudge clientId={clientId} />
              <NeedsConnection
                id="google"
                because={t("needsConnectionBecause")}
              />
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">{t("colQuery")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("colDevice")}</th>
                <th className="px-3 py-3 text-center font-medium">
                  <span
                    className="inline-flex items-center gap-1"
                    title={t("colPositionTitle")}
                  >
                    {t("colPosition")}
                    <span
                      aria-hidden
                      className="grid size-3.5 cursor-help place-items-center rounded-full bg-muted/60 text-[8px] font-bold text-muted-foreground/80 ring-1 ring-inset ring-border"
                    >
                      ?
                    </span>
                  </span>
                </th>
                <th className="px-3 py-3 text-left font-medium">{t("colSerpFeatures")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("colTrend")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tracked.map((k) => {
                const history = ranksByKeyword.get(k.id) ?? [];
                const latest = history[history.length - 1];
                const removeAction = untrackKeyword.bind(null, k.id);
                const deviceKey =
                  k.device === "desktop" || k.device === "mobile"
                    ? k.device
                    : "desktop";
                return (
                  <tr key={k.id} className="hover:bg-white/[0.03]">
                    <td className="px-5 py-3">
                      <div className="font-medium">{k.query}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {k.country}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${deviceTone[k.device]}`}
                      >
                        {t(`device.${deviceKey}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PositionBadge position={latest?.position ?? null} />
                      {latest && (
                        <div className="mt-1 flex justify-center">
                          <RankSourceBadge
                            source={latest.source}
                            dataDate={latest.dataDate}
                            impressions={latest.impressions}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SerpFeaturePills
                        hasAiOverview={!!latest?.hasAiOverview}
                        hasFeaturedSnippet={!!latest?.hasFeaturedSnippet}
                        hasLocalPack={!!latest?.hasLocalPack}
                        paaCount={latest?.paaCount ?? 0}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <RankSparkline
                        history={history.map((h) => ({
                          checkedAt: h.checkedAt,
                          position: h.position,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <CheckRankButton keywordId={k.id} />
                        <ScanSerpButton keywordId={k.id} />
                        <Link
                          href={`/keywords/${k.id}/screenshots`}
                          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
                          title={t("viewScreenshots")}
                        >
                          <Camera className="size-3.5" />
                        </Link>
                        <form action={removeAction}>
                          <button
                            type="submit"
                            aria-label={t("untrack")}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                          >
                            <X className="size-3.5" />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
