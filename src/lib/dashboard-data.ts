import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { isNotNull } from "drizzle-orm";
import {
  getGa4OrganicTraffic,
  getGscQuickWins,
  type GscKeyword,
} from "./google-data";

/**
 * Aggregates GSC + GA4 across every client that has Google linked. Used by
 * the dashboard to show portfolio-level numbers without each panel making N
 * round-trips itself.
 *
 * Each per-client fetch fails silently — one bad token doesn't break the
 * whole dashboard.
 */

export type PortfolioTraffic = {
  /** Number of clients that contributed data */
  clientsContributing: number;
  /** Aggregated daily totals over last 28 days, ascending by date */
  daily: { date: string; sessions: number }[];
  totalSessions: number;
  totalUsers: number;
  totalPageviews: number;
  /** Week-over-week % change in sessions, or null when not enough history */
  deltaPct: number | null;
  /** Per-client mover list — biggest absolute session change */
  movers: PortfolioMover[];
};

export type PortfolioMover = {
  clientId: number;
  clientName: string;
  clientUrl: string;
  recentSessions: number;
  priorSessions: number;
  deltaPct: number | null;
};

export async function getPortfolioTraffic(): Promise<PortfolioTraffic> {
  const linked = await db
    .select()
    .from(clients)
    .where(isNotNull(clients.ga4PropertyId));

  if (linked.length === 0) {
    return {
      clientsContributing: 0,
      daily: [],
      totalSessions: 0,
      totalUsers: 0,
      totalPageviews: 0,
      deltaPct: null,
      movers: [],
    };
  }

  const results = await Promise.all(
    linked.map(async (c) => {
      if (!c.ga4PropertyId) return null;
      const rows = await getGa4OrganicTraffic({
        propertyId: c.ga4PropertyId,
        days: 28,
      });
      return { client: c, rows };
    }),
  );

  const valid = results.filter(
    (r): r is { client: (typeof linked)[number]; rows: Awaited<ReturnType<typeof getGa4OrganicTraffic>> } =>
      r !== null && r.rows.length > 0,
  );

  // Aggregate daily totals across all clients keyed by date
  const dailyMap = new Map<string, { sessions: number }>();
  let totalSessions = 0;
  let totalUsers = 0;
  let totalPageviews = 0;

  for (const { rows } of valid) {
    for (const r of rows) {
      const cur = dailyMap.get(r.date) ?? { sessions: 0 };
      cur.sessions += r.sessions;
      dailyMap.set(r.date, cur);
      totalSessions += r.sessions;
      totalUsers += r.users;
      totalPageviews += r.pageviews;
    }
  }

  const daily = [...dailyMap.entries()]
    .map(([date, { sessions }]) => ({ date, sessions }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const half = Math.floor(daily.length / 2);
  const recent = daily.slice(half).reduce((s, r) => s + r.sessions, 0);
  const prior = daily.slice(0, half).reduce((s, r) => s + r.sessions, 0);
  const deltaPct =
    prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;

  // Movers: per-client week-over-week
  const movers: PortfolioMover[] = valid.map(({ client, rows }) => {
    const halfC = Math.floor(rows.length / 2);
    const recentC = rows.slice(halfC).reduce((s, r) => s + r.sessions, 0);
    const priorC = rows.slice(0, halfC).reduce((s, r) => s + r.sessions, 0);
    return {
      clientId: client.id,
      clientName: client.name,
      clientUrl: client.url,
      recentSessions: recentC,
      priorSessions: priorC,
      deltaPct:
        priorC > 0 ? Math.round(((recentC - priorC) / priorC) * 100) : null,
    };
  });

  // Biggest absolute movers first (positive or negative)
  movers.sort((a, b) => {
    const da = Math.abs(a.recentSessions - a.priorSessions);
    const db = Math.abs(b.recentSessions - b.priorSessions);
    return db - da;
  });

  return {
    clientsContributing: valid.length,
    daily,
    totalSessions,
    totalUsers,
    totalPageviews,
    deltaPct,
    movers: movers.slice(0, 5),
  };
}

export type PortfolioQuickWin = GscKeyword & {
  clientId: number;
  clientName: string;
};

export async function getPortfolioQuickWins(opts?: {
  limit?: number;
}): Promise<PortfolioQuickWin[]> {
  const linked = await db
    .select()
    .from(clients)
    .where(isNotNull(clients.gscProperty));

  if (linked.length === 0) return [];

  const results = await Promise.all(
    linked.map(async (c) => {
      if (!c.gscProperty) return [];
      const wins = await getGscQuickWins({
        siteUrl: c.gscProperty,
        days: 28,
        limit: 5,
        minImpressions: 100, // higher bar for the cross-client view
      });
      return wins.map((w) => ({
        ...w,
        clientId: c.id,
        clientName: c.name,
      }));
    }),
  );

  const flat = results.flat();
  flat.sort((a, b) => b.impressions - a.impressions);
  return flat.slice(0, opts?.limit ?? 8);
}
