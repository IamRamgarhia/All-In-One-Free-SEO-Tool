export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { Search, X, Camera, Activity } from "lucide-react";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { clients, keywordRankFailures, keywords, keywordRankings } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ResearchForm } from "@/app/keywords/research-form";
import { CsvImportExport } from "@/app/keywords/import-form";
import { CheckRankButton, CheckAllRanksButton } from "@/app/keywords/rank-buttons";
import { ScanSerpButton } from "@/app/keywords/serp-button";
import { untrackKeyword } from "@/app/keywords/actions";
import {
  ConnectGscNudge,
  RankSourceBadge,
} from "@/components/ui/rank-source-badge";
import { NeedsConnection } from "@/components/ui/needs-connection";
import { describeRankFailures, type RankTx } from "@/lib/serp/describe";
import { absenceOf, absenceStringsFromMessages, describeAbsence, type RankReadingLike } from "@/lib/serp/absence";
import { parseStoredFailures } from "@/lib/serp/failure";
import type { RankSource } from "@/lib/serp/sources";
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
      source: RankSource | string;
      engine: string | null;
      resultsScanned: number | null;
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
      engine: r.engine,
      resultsScanned: r.resultsScanned,
      impressions: r.impressions,
      dataDate: r.dataDate,
    });
    ranksByKeyword.set(r.keywordId, list);
  }

  // The most recent failed check per keyword. When it is newer than the
  // last reading, the list says "not checked" rather than showing that
  // older reading as if it were today's.
  const failureRows =
    tracked.length === 0
      ? []
      : await db
          .select()
          .from(keywordRankFailures)
          .where(
            inArray(
              keywordRankFailures.keywordId,
              tracked.map((k) => k.id),
            ),
          )
          .orderBy(keywordRankFailures.checkedAt);
  const lastFailure = new Map<number, (typeof failureRows)[number]>();
  for (const f of failureRows) lastFailure.set(f.keywordId, f);
  const rt = (await getTranslations("rankCheck")) as unknown as RankTx;
  const dateFmt = new Intl.DateTimeFormat((await getLocale()) === "fr" ? "fr-FR" : "en-GB", {
    timeZone: await getTimeZone(),
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // "Absent from the first N results (engine)", never a bare "not
  // ranked": DuckDuckGo reads about ten results, Google up to a hundred.
  // Same wording as the reports, the CSV and the API (lib/serp/absence).
  const absenceStrings = absenceStringsFromMessages(t as unknown as RankTx, rt);
  const pageLocale = await getLocale();
  const absentText = (r: RankReadingLike): string => {
    const a = absenceOf(r);
    return a ? describeAbsence(a, absenceStrings, pageLocale) : "";
  };

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
          <header className="flex flex-col gap-3 border-b border-white/5 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">
                {t("trackedTitle", { count: tracked.length })}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {client.gscProperty
                  ? t("trackedHintGsc")
                  : t("trackedHintBrowser")}
              </p>
            </div>
            <CheckAllRanksButton clientId={clientId} />
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 text-left font-medium sm:px-5">{t("colQuery")}</th>
                <th className="hidden px-3 py-3 text-left font-medium sm:table-cell">{t("colDevice")}</th>
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
                <th className="hidden px-3 py-3 text-left font-medium md:table-cell">{t("colSerpFeatures")}</th>
                <th className="hidden px-3 py-3 text-left font-medium sm:table-cell">{t("colTrend")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tracked.map((k) => {
                const history = ranksByKeyword.get(k.id) ?? [];
                const latest = history[history.length - 1];
                const removeAction = untrackKeyword.bind(null, k.id);
                const failure = lastFailure.get(k.id);
                const failedLast =
                  !!failure && (!latest || failure.checkedAt > latest.checkedAt);
                const failedText = failedLast
                  ? describeRankFailures(rt, parseStoredFailures(failure!.failures))
                  : "";
                const deviceKey =
                  k.device === "desktop" || k.device === "mobile"
                    ? k.device
                    : "desktop";
                return (
                  <tr key={k.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-3 sm:px-5">
                      <div className="font-medium">{k.query}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {k.country}
                        {/* The device column is hidden on a phone; say it here. */}
                        <span className="sm:hidden"> · {t(`device.${deviceKey}`)}</span>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${deviceTone[k.device]}`}
                      >
                        {t(`device.${deviceKey}`)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {failedLast ? (
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className="inline-flex h-7 items-center justify-center rounded-lg bg-amber-500/10 px-2 text-[11px] font-medium text-amber-200 ring-1 ring-inset ring-amber-500/30"
                            title={failedText}
                          >
                            {t("notChecked")}
                          </span>
                          <p className="max-w-[14rem] text-[10px] leading-snug text-amber-200/80">
                            {failedText}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {t("notCheckedAt", { date: dateFmt.format(failure!.checkedAt) })}
                            {latest
                              ? ` · ${t("lastReading", {
                                  position:
                                    latest.position === null ? "—" : `#${latest.position}`,
                                })}`
                              : ""}
                          </p>
                        </div>
                      ) : (
                        <>
                          <PositionBadge position={latest?.position ?? null} />
                          {latest && latest.position === null && (
                            <p className="mx-auto mt-1 max-w-[12rem] text-[10px] leading-snug text-muted-foreground">
                              {absentText(latest)}
                            </p>
                          )}
                          {latest && (
                            <div className="mt-1 flex justify-center">
                              <RankSourceBadge
                                source={latest.source}
                                engine={latest.engine}
                                dataDate={latest.dataDate}
                                impressions={latest.impressions}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">
                      <SerpFeaturePills
                        hasAiOverview={!!latest?.hasAiOverview}
                        hasFeaturedSnippet={!!latest?.hasFeaturedSnippet}
                        hasLocalPack={!!latest?.hasLocalPack}
                        paaCount={latest?.paaCount ?? 0}
                      />
                    </td>
                    <td className="hidden px-3 py-3 sm:table-cell">
                      <RankSparkline
                        history={history.map((h) => ({
                          checkedAt: h.checkedAt,
                          position: h.position,
                        }))}
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1">
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
          </div>
        </section>
      )}
    </div>
  );
}
