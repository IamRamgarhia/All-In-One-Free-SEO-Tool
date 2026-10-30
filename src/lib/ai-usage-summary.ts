/**
 * What has been spent on AI, aggregated in SQL.
 *
 * Extracted from the /settings/ai-usage page, which computed its
 * headline numbers from a `.limit(500)` slice of recent calls:
 *
 *     const recentCalls = await db.select()...limit(500);
 *     const total = recentCalls.length;
 *     const totalCost = recentCalls.reduce(...);
 *     const monthCost = recentCalls.filter(month).reduce(...);
 *
 * Past 500 calls in the window those stop being totals and become "the
 * total of the 500 most recent", under labels that say otherwise — the
 * same shape as the Search Console bug fixed earlier today, where a
 * top-200 query list was summed and presented as a site's traffic. The
 * per-client block already used full SQL and its comment says exactly
 * why; the headline numbers did not.
 *
 * Spend *enforcement* was never affected — `checkMonthlyCap` sums the
 * month in SQL — so nobody was overcharged. The display was the thing
 * that could under-report, including the figure shown next to the cap.
 *
 * This is also what the MCP `get_ai_usage` tool serves, so a question
 * asked through Claude and a page opened in a browser cannot disagree.
 */

import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db/client";
import { aiCalls, clients } from "@/db/schema";

export type UsageBucket = {
  key: string;
  calls: number;
  costMicros: number;
  tokens: number;
};

export type AiUsageSummary = {
  windowDays: number;
  since: Date;
  /** Whole window. */
  calls: number;
  costMicros: number;
  tokensIn: number;
  tokensOut: number;
  /** Since 00:00 UTC today. */
  todayCalls: number;
  todayCostMicros: number;
  /** Since the 1st of the calendar month — the figure the cap is about. */
  monthCostMicros: number;
  /** How many calls failed, in the window. A spend summary that ignores
   *  these reads as healthier than it is. */
  errorCalls: number;
  byFeature: UsageBucket[];
  byProvider: UsageBucket[];
  byModel: UsageBucket[];
  byClient: (UsageBucket & { clientId: number | null })[];
  /** One row per day, oldest first, with no gaps. */
  daily: { day: string; calls: number; costMicros: number }[];
};

const DAY_MS = 86_400_000;

function startOfUtcDay(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

/**
 * Group by one column, in SQL, over the window.
 *
 * Typed as SQLiteColumn rather than `typeof aiCalls.feature`: Drizzle's
 * column types carry the column NAME, so the narrower annotation makes
 * a helper that only ever accepts `feature`.
 */
async function bucket(
  column: SQLiteColumn,
  since: Date,
): Promise<UsageBucket[]> {
  const rows = await db
    .select({
      key: column,
      calls: count(aiCalls.id),
      cost: sum(aiCalls.costMicros),
      tokens: sum(aiCalls.totalTokens),
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, since))
    .groupBy(column)
    .orderBy(desc(sum(aiCalls.costMicros)));

  return rows.map((r) => ({
    key: String(r.key ?? "unknown"),
    calls: Number(r.calls ?? 0),
    costMicros: Number(r.cost ?? 0),
    tokens: Number(r.tokens ?? 0),
  }));
}

export async function getAiUsageSummary(
  windowDays = 30,
): Promise<AiUsageSummary> {
  const since = new Date(Date.now() - windowDays * DAY_MS);
  const today = startOfUtcDay();
  const monthStart = startOfUtcDay();
  monthStart.setUTCDate(1);

  const [totals] = await db
    .select({
      calls: count(aiCalls.id),
      cost: sum(aiCalls.costMicros),
      tin: sum(aiCalls.promptTokens),
      tout: sum(aiCalls.completionTokens),
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, since));

  const [todayRow] = await db
    .select({ calls: count(aiCalls.id), cost: sum(aiCalls.costMicros) })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, today));

  const [monthRow] = await db
    .select({ cost: sum(aiCalls.costMicros) })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, monthStart));

  const [errorRow] = await db
    .select({ calls: count(aiCalls.id) })
    .from(aiCalls)
    .where(and(gte(aiCalls.createdAt, since), eq(aiCalls.status, "error")));

  const [byFeature, byProvider, byModel] = await Promise.all([
    bucket(aiCalls.feature, since),
    bucket(aiCalls.provider, since),
    bucket(aiCalls.model, since),
  ]);

  const perClient = await db
    .select({
      clientId: aiCalls.clientId,
      clientName: clients.name,
      calls: count(aiCalls.id),
      cost: sum(aiCalls.costMicros),
      tokens: sum(aiCalls.totalTokens),
    })
    .from(aiCalls)
    .leftJoin(clients, eq(aiCalls.clientId, clients.id))
    .where(gte(aiCalls.createdAt, since))
    .groupBy(aiCalls.clientId)
    .orderBy(desc(sum(aiCalls.costMicros)));

  // Day buckets in SQL. Doing this by filtering a 500-row array was the
  // other half of the same bug: past the limit the sparkline flattened
  // out for the oldest days rather than showing what happened.
  const dayRows = await db
    .select({
      day: sql<string>`strftime('%Y-%m-%d', ${aiCalls.createdAt}, 'unixepoch')`,
      calls: count(aiCalls.id),
      cost: sum(aiCalls.costMicros),
    })
    .from(aiCalls)
    .where(gte(aiCalls.createdAt, since))
    .groupBy(sql`1`);

  const byDay = new Map(
    dayRows.map((r) => [
      String(r.day),
      { calls: Number(r.calls ?? 0), costMicros: Number(r.cost ?? 0) },
    ]),
  );
  // Every day in the window, including the silent ones — a gap and a
  // zero are different things on a chart, and only one of them is true.
  const daily: AiUsageSummary["daily"] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = startOfUtcDay(new Date(Date.now() - i * DAY_MS));
    const key = d.toISOString().slice(0, 10);
    const hit = byDay.get(key);
    daily.push({
      day: key,
      calls: hit?.calls ?? 0,
      costMicros: hit?.costMicros ?? 0,
    });
  }

  return {
    windowDays,
    since,
    calls: Number(totals?.calls ?? 0),
    costMicros: Number(totals?.cost ?? 0),
    tokensIn: Number(totals?.tin ?? 0),
    tokensOut: Number(totals?.tout ?? 0),
    todayCalls: Number(todayRow?.calls ?? 0),
    todayCostMicros: Number(todayRow?.cost ?? 0),
    monthCostMicros: Number(monthRow?.cost ?? 0),
    errorCalls: Number(errorRow?.calls ?? 0),
    byFeature,
    byProvider,
    byModel,
    byClient: perClient.map((r) => ({
      clientId: r.clientId,
      key:
        r.clientName ??
        (r.clientId === null ? "Workspace-wide" : "(deleted client)"),
      calls: Number(r.calls ?? 0),
      costMicros: Number(r.cost ?? 0),
      tokens: Number(r.tokens ?? 0),
    })),
    daily,
  };
}
