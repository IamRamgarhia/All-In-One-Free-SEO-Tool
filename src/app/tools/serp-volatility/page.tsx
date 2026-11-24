export const dynamic = "force-dynamic";

import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { and, desc, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { comparePositions } from "@/lib/rank-comparison";

type Movement = {
  keywordId: number;
  query: string;
  clientId: number;
  clientName: string;
  device: string;
  first: number;
  last: number;
  delta: number;
};

/**
 * Tracks day-over-day position shifts across every tracked keyword to
 * surface SERP volatility. High volatility scores correlate strongly
 * with Google algorithm updates — when this number jumps, you know
 * Google probably rolled something out.
 *
 * Per-keyword volatility = |last position − first position| over the
 * window. The overall score is the average across all keywords with
 * ≥2 checks in the window, capped at 100. Lower position = better
 * rank, so deltas are taken on absolute values not signed.
 */
export default async function SerpVolatilityPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const t = await getTranslations("tools.ui.serp-volatility");
  const windowDays = Math.max(2, Math.min(30, Number(params?.days ?? 7)));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);
  since.setUTCHours(0, 0, 0, 0);

  const allClients = await db.select().from(clients).where(await clientScope());
  const trackedKw = await db.select().from(keywords);
  const kwById = new Map(trackedKw.map((k) => [k.id, k]));
  const clientById = new Map(allClients.map((c) => [c.id, c]));

  let recent: (typeof keywordRankings.$inferSelect)[] = [];
  if (trackedKw.length > 0) {
    recent = await db
      .select()
      .from(keywordRankings)
      .where(
        and(
          inArray(
            keywordRankings.keywordId,
            trackedKw.map((k) => k.id),
          ),
          gte(keywordRankings.checkedAt, since),
        ),
      )
      .orderBy(desc(keywordRankings.checkedAt));
  }

  // Bucket per keyword, then compute movement for keywords with ≥2 checks
  const byKw = new Map<number, typeof recent>();
  for (const r of recent) {
    const arr = byKw.get(r.keywordId) ?? [];
    arr.push(r);
    byKw.set(r.keywordId, arr);
  }

  const movements: Movement[] = [];
  // Keywords whose two ends of the window came from different sources
  // (a Search Console average and a DuckDuckGo page, say). Excluded from
  // the score rather than counted as movement, and reported, because
  // silently dropping them would overstate what the score covers.
  let incomparable = 0;
  for (const [keywordId, history] of byKw.entries()) {
    if (history.length < 2) continue;
    // Recent first → oldest last (because of desc above). The "first" in
    // chronological terms is the last element.
    const oldest = history[history.length - 1];
    const newest = history[0];
    const k = kwById.get(keywordId);
    if (!k) continue;
    const c = clientById.get(k.clientId);
    if (!c) continue;
    // A source switch is not a shift in the results page. This score
    // averages |delta| and labels the result calm/stormy, so including
    // one reported an algorithm update that never happened.
    const movement = comparePositions(oldest, newest);
    if (!movement.comparable) {
      if (movement.note) incomparable += 1;
      continue;
    }
    movements.push({
      keywordId,
      query: k.query,
      clientId: k.clientId,
      clientName: c.name,
      device: k.device,
      first: oldest.position as number,
      last: newest.position as number,
      delta: movement.drop as number,
    });
  }

  const volatilityScore =
    movements.length === 0
      ? 0
      : Math.min(
          100,
          Math.round(
            movements.reduce((s, m) => s + Math.abs(m.delta), 0) /
              movements.length,
          ),
        );
  const severity =
    volatilityScore >= 15
      ? ("stormy" as const)
      : volatilityScore >= 5
        ? ("moderate" as const)
        : ("calm" as const);
  const severityCopy = t(severity);

  // Top gainers (improving = position went DOWN), top losers
  const gainers = movements
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 10);
  const losers = movements
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={Activity}
        accent="amber"
      />

      {trackedKw.length === 0 ? (
        <div className="glass-apple rounded-2xl p-6 text-sm text-muted-foreground">
          {t("noKeywords")}
        </div>
      ) : movements.length === 0 ? (
        <div className="glass-apple rounded-2xl p-6 text-sm text-muted-foreground">
          {t("noMovements", { days: windowDays })}
        </div>
      ) : (
        <>
          <section
            className={`glass-apple relative overflow-hidden rounded-2xl p-6 ring-1 ring-inset ${
              severity === "stormy"
                ? "ring-rose-500/40"
                : severity === "moderate"
                  ? "ring-amber-500/40"
                  : "ring-emerald-500/40"
            }`}
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("scoreLabel", { days: windowDays })}
                </div>
                <div
                  className={`mt-1 text-5xl font-bold tabular-nums ${
                    severity === "stormy"
                      ? "text-rose-300"
                      : severity === "moderate"
                        ? "text-amber-300"
                        : "text-emerald-300"
                  }`}
                >
                  {volatilityScore}
                  <span className="text-base text-muted-foreground">/100</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {severityCopy}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <div>
                  {t.rich("withChecks", {
                    count: movements.length,
                    b: (chunks) => (
                      <strong className="text-foreground">{chunks}</strong>
                    ),
                  })}
                </div>
                {incomparable > 0 && (
                  <div className="text-amber-300/80">
                    {t("excludedSources", { count: incomparable })}
                  </div>
                )}
                <div>
                  {t.rich("improvedDropped", {
                    up: gainers.length,
                    down: losers.length,
                    g: (chunks) => (
                      <strong className="text-emerald-300">{chunks}</strong>
                    ),
                    r: (chunks) => (
                      <strong className="text-rose-300">{chunks}</strong>
                    ),
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 text-[11px]">
              {[2, 7, 14, 30].map((d) => (
                <a
                  key={d}
                  href={`/tools/serp-volatility?days=${d}`}
                  className={`rounded-md px-2 py-1 ring-1 ring-inset ${
                    d === windowDays
                      ? "bg-white/10 text-foreground ring-white/20"
                      : "bg-white/[0.02] text-muted-foreground ring-white/5 hover:bg-white/5"
                  }`}
                >
                  {t("daysShort", { days: d })}
                </a>
              ))}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <MoversTable
              title={t("gainers")}
              tone="emerald"
              empty={t("gainersEmpty")}
              movements={gainers}
            />
            <MoversTable
              title={t("droppers")}
              tone="rose"
              empty={t("droppersEmpty")}
              movements={losers}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MoversTable({
  title,
  tone,
  empty,
  movements,
}: {
  title: string;
  tone: "emerald" | "rose";
  empty: string;
  movements: Movement[];
}) {
  const t = useTranslations("tools.ui.serp-volatility");
  const toneCls = tone === "emerald" ? "text-emerald-300" : "text-rose-300";
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="border-b border-white/[0.06] px-5 py-3">
        <h3 className={`text-sm font-semibold ${toneCls}`}>{title}</h3>
      </header>
      {movements.length === 0 ? (
        <p className="px-5 py-6 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">{t("colQuery")}</th>
              <th className="px-4 py-2 text-left">{t("colClient")}</th>
              <th className="px-4 py-2 text-right">{t("colFromTo")}</th>
              <th className="px-4 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr
                key={m.keywordId}
                className="border-t border-white/[0.04]"
              >
                <td className="px-4 py-1.5 font-medium">{m.query}</td>
                <td className="px-4 py-1.5 text-muted-foreground">
                  {m.clientName}
                </td>
                <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">
                  #{m.first} → #{m.last}
                </td>
                <td className={`px-4 py-1.5 text-right tabular-nums ${toneCls}`}>
                  {m.delta > 0 ? `+${m.delta}` : m.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
