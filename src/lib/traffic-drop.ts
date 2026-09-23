/**
 * "Why did my traffic drop" diagnostic. Pulls GSC data for the last 56
 * days (8 weeks), splits into two 28-day windows, computes:
 *
 *   - Total clicks + impressions delta
 *   - Per-query drops (queries that lost the most clicks)
 *   - Per-page drops (pages that lost the most clicks)
 *   - SERP feature impact (what queries lost AI Overviews / featured snippets)
 *   - Algorithm-update overlap (Google's Search Status Dashboard record)
 *
 * Then it asks the AI to write a plain-English diagnosis ranked by
 * likelihood: algorithm update / lost SERP feature / specific page issue
 * / seasonal / something else.
 */

import { fetchGscPerformance } from "./google-oauth";
import { callAI } from "./ai-call";
import { updatesNear, type AlgoUpdate } from "./algorithm-updates";
import { getRankingUpdates } from "./google-updates-store";

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export type TrafficDropResult = {
  ok: boolean;
  /** Total clicks last 28 days. */
  recentClicks: number;
  /** Total clicks 28-56 days ago. */
  prevClicks: number;
  recentImpressions: number;
  prevImpressions: number;
  /** Negative = drop. */
  clicksDelta: number;
  clicksDeltaPct: number;
  /** Top queries that lost clicks. */
  topQueryDrops: { query: string; recent: number; prev: number; delta: number }[];
  /** Top pages that lost clicks. */
  topPageDrops: { page: string; recent: number; prev: number; delta: number }[];
  /** Algorithm updates that overlap the recent 28-day window. */
  algorithmOverlaps: AlgoUpdate[];
  /** AI-written plain-language diagnosis with ranked likely causes. */
  diagnosis: string;
  error?: string;
};

const SYSTEM_PROMPT = `You are a senior technical SEO auditor. The user gives you a 28-day organic traffic drop with the data to triangulate causes. Produce a ranked diagnosis.

Output markdown bullets, ranked most→least likely cause:
- Lead with the SINGLE most likely root cause (one bold line)
- 2-4 supporting bullets with the data points that point at that cause
- A separate "Other plausible causes" subsection with 1-3 alternatives
- A "Next steps" subsection with 3-4 specific actions to verify and fix
- ≤350 words. No preamble.

Rules:
- Be specific with numbers. "Clicks fell 18% (3,200 → 2,624)" not "clicks fell".
- If an algorithm update overlaps the window, say so plainly and stop hedging.
- Don't invent causes that the data doesn't support.`;

export async function diagnoseTrafficDrop(opts: {
  siteUrl: string;
  clientId?: number;
}): Promise<TrafficDropResult> {
  const recentStart = daysAgo(30);
  const recentEnd = daysAgo(2);
  const prevStart = daysAgo(58);
  const prevEnd = daysAgo(31);

  // Pull both windows in parallel — by query AND by page
  let recentByQuery: Awaited<ReturnType<typeof fetchGscPerformance>> = [];
  let prevByQuery: typeof recentByQuery = [];
  let recentByPage: typeof recentByQuery = [];
  let prevByPage: typeof recentByQuery = [];
  try {
    [recentByQuery, prevByQuery, recentByPage, prevByPage] = await Promise.all([
      fetchGscPerformance({
        siteUrl: opts.siteUrl,
        startDate: recentStart,
        endDate: recentEnd,
        dimensions: ["query"],
        rowLimit: 500,
      }),
      fetchGscPerformance({
        siteUrl: opts.siteUrl,
        startDate: prevStart,
        endDate: prevEnd,
        dimensions: ["query"],
        rowLimit: 500,
      }),
      fetchGscPerformance({
        siteUrl: opts.siteUrl,
        startDate: recentStart,
        endDate: recentEnd,
        dimensions: ["page"],
        rowLimit: 500,
      }),
      fetchGscPerformance({
        siteUrl: opts.siteUrl,
        startDate: prevStart,
        endDate: prevEnd,
        dimensions: ["page"],
        rowLimit: 500,
      }),
    ]);
  } catch (err) {
    return empty(`Couldn't fetch GSC data: ${(err as Error).message}`);
  }

  const recentClicks = sumClicks(recentByQuery);
  const prevClicks = sumClicks(prevByQuery);
  const recentImpressions = sumImpressions(recentByQuery);
  const prevImpressions = sumImpressions(prevByQuery);

  const clicksDelta = recentClicks - prevClicks;
  const clicksDeltaPct = prevClicks > 0 ? (clicksDelta / prevClicks) * 100 : 0;

  const topQueryDrops = computeDeltas(
    recentByQuery,
    prevByQuery,
    (r) => r.keys[0] ?? "",
  )
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 10)
    .map((d) => ({
      query: d.key,
      recent: d.recent,
      prev: d.prev,
      delta: d.delta,
    }));

  const topPageDrops = computeDeltas(
    recentByPage,
    prevByPage,
    (r) => r.keys[0] ?? "",
  )
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 8)
    .map((d) => ({
      page: d.key,
      recent: d.recent,
      prev: d.prev,
      delta: d.delta,
    }));

  const algorithmOverlaps = updatesNear(await getRankingUpdates(), recentStart, recentEnd);

  const diagnosis = await aiDiagnose({
    siteUrl: opts.siteUrl,
    recentClicks,
    prevClicks,
    recentImpressions,
    prevImpressions,
    clicksDelta,
    clicksDeltaPct,
    topQueryDrops,
    topPageDrops,
    algorithmOverlaps,
    clientId: opts.clientId,
  });

  return {
    ok: true,
    recentClicks,
    prevClicks,
    recentImpressions,
    prevImpressions,
    clicksDelta,
    clicksDeltaPct,
    topQueryDrops,
    topPageDrops,
    algorithmOverlaps,
    diagnosis,
  };
}

type Row = { keys: string[]; clicks: number; impressions: number };

function sumClicks(rows: Row[]): number {
  return rows.reduce((s, r) => s + r.clicks, 0);
}
function sumImpressions(rows: Row[]): number {
  return rows.reduce((s, r) => s + r.impressions, 0);
}

function computeDeltas(
  recent: Row[],
  prev: Row[],
  keyOf: (r: Row) => string,
): { key: string; recent: number; prev: number; delta: number }[] {
  const recentMap = new Map<string, number>();
  for (const r of recent) {
    const k = keyOf(r);
    if (k) recentMap.set(k, r.clicks);
  }
  const prevMap = new Map<string, number>();
  for (const r of prev) {
    const k = keyOf(r);
    if (k) prevMap.set(k, r.clicks);
  }
  const allKeys = new Set([...recentMap.keys(), ...prevMap.keys()]);
  const out: { key: string; recent: number; prev: number; delta: number }[] = [];
  for (const k of allKeys) {
    const r = recentMap.get(k) ?? 0;
    const p = prevMap.get(k) ?? 0;
    out.push({ key: k, recent: r, prev: p, delta: r - p });
  }
  return out;
}

async function aiDiagnose(opts: {
  siteUrl: string;
  recentClicks: number;
  prevClicks: number;
  recentImpressions: number;
  prevImpressions: number;
  clicksDelta: number;
  clicksDeltaPct: number;
  topQueryDrops: { query: string; recent: number; prev: number; delta: number }[];
  topPageDrops: { page: string; recent: number; prev: number; delta: number }[];
  algorithmOverlaps: AlgoUpdate[];
  clientId?: number;
}): Promise<string> {
  const userPrompt = [
    `Site: ${opts.siteUrl}`,
    `Last 28 days clicks: ${opts.recentClicks} (was ${opts.prevClicks} the prior 28 days, delta ${opts.clicksDeltaPct.toFixed(1)}%)`,
    `Impressions: ${opts.recentImpressions} (was ${opts.prevImpressions})`,
    "",
    `Algorithm updates that overlap this window:`,
    ...(opts.algorithmOverlaps.length === 0
      ? ["  - none"]
      : opts.algorithmOverlaps.map(
          (u) => `  - ${u.name} (${u.date} → ${u.endDate ?? u.date}, ${u.type})`,
        )),
    "",
    `Top query drops (clicks lost):`,
    ...opts.topQueryDrops.map(
      (d) => `  - "${d.query}": ${d.prev} → ${d.recent} (delta ${d.delta})`,
    ),
    "",
    `Top page drops (clicks lost):`,
    ...opts.topPageDrops.map(
      (d) => `  - ${d.page}: ${d.prev} → ${d.recent} (delta ${d.delta})`,
    ),
    "",
    `Write the ranked diagnosis now.`,
  ].join("\n");

  const out = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 800,
    temperature: 0.4,
    timeoutMs: 30_000,
    feature: "general",
    clientId: opts.clientId ?? null,
  });
  return out ?? "";
}

function empty(error: string): TrafficDropResult {
  return {
    ok: false,
    recentClicks: 0,
    prevClicks: 0,
    recentImpressions: 0,
    prevImpressions: 0,
    clicksDelta: 0,
    clicksDeltaPct: 0,
    topQueryDrops: [],
    topPageDrops: [],
    algorithmOverlaps: [],
    diagnosis: "",
    error,
  };
}
