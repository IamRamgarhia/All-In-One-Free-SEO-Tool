/**
 * Client metric snapshots — periodic capture of every signal that
 * matters in a monthly report. Captured in three modes:
 *
 *   - **baseline**: triggered once on client onboarding completion. The
 *     report's "since you started" comparison anchors here.
 *   - **weekly**: scheduled by the daily-agent runner.
 *   - **manual**: user-triggered from the report page.
 *
 * Every snapshot is one row in `client_metric_snapshots` so the report
 * can pull (newest, baseline) and render delta charts trivially.
 */

import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { pickReferenceAudits } from "./reference-audit";
import { db } from "@/db/client";
import {
  audits,
  auditIssues,
  backlinks,
  brandMentions,
  clientMetricSnapshots,
  clients,
  gbpPlaybookCompletions,
  keywordRankings,
  keywords,
  tasks,
  type ClientMetricSnapshot,
} from "@/db/schema";
import {
  getGscTopQueries,
  getGa4OrganicTraffic,
  getGa4OrganicConversions,
} from "./google-data";
import { playbookFor } from "./gbp-playbook";

export type SnapshotKind = "baseline" | "weekly" | "monthly" | "manual";

export async function captureClientSnapshot(opts: {
  clientId: number;
  kind: SnapshotKind;
}): Promise<ClientMetricSnapshot | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!client) return null;

  const [
    healthScore,
    gscRows,
    ga4Rows,
    ga4Conv,
    kwCount,
    rankStats,
    issues,
    bl,
    gbpDone,
    mentionsRecent,
    tasksDone,
  ] = await Promise.all([
    latestAuditScore(opts.clientId),
    client.gscProperty
      ? getGscTopQueries({
          siteUrl: client.gscProperty,
          days: 28,
          limit: 1000,
        }).catch(() => [])
      : Promise.resolve([]),
    client.ga4PropertyId
      ? getGa4OrganicTraffic({
          propertyId: client.ga4PropertyId,
          days: 28,
        }).catch(() => [])
      : Promise.resolve([]),
    client.ga4PropertyId
      ? getGa4OrganicConversions({
          propertyId: client.ga4PropertyId,
          days: 28,
        }).catch(() => null)
      : Promise.resolve(null),
    db
      .select({ value: count() })
      .from(keywords)
      .where(eq(keywords.clientId, opts.clientId)),
    rankAggregate(opts.clientId),
    issueCounts(opts.clientId),
    db
      .select({ value: count() })
      .from(backlinks)
      .where(eq(backlinks.clientId, opts.clientId)),
    // GBP playbook completions: count once-permanent items + this-period
    // recurring items (same dedupe logic the UI uses). The naive count
    // would over-count recurring items completed in past weeks.
    (async () => {
      const rows = await db
        .select({
          itemId: gbpPlaybookCompletions.itemId,
          occurrence: gbpPlaybookCompletions.occurrence,
        })
        .from(gbpPlaybookCompletions)
        .where(eq(gbpPlaybookCompletions.clientId, opts.clientId));
      const now = new Date();
      const onejan = new Date(now.getUTCFullYear(), 0, 1);
      const week = Math.ceil(
        ((now.getTime() - onejan.getTime()) / 86_400_000 + onejan.getDay() + 1) /
          7,
      );
      const weekKey = `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
      const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const qKey = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
      const counted = new Set<string>();
      for (const r of rows) {
        if (
          r.occurrence === null ||
          r.occurrence === weekKey ||
          r.occurrence === monthKey ||
          r.occurrence === qKey
        ) {
          counted.add(r.itemId);
        }
      }
      return [{ value: counted.size }];
    })(),
    db
      .select({ value: count() })
      .from(brandMentions)
      .where(
        and(
          eq(brandMentions.clientId, opts.clientId),
          gte(
            brandMentions.capturedAt,
            new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
          ),
        ),
      ),
    tasksCompletedSince(opts.clientId, 28),
  ]);

  const totalClicks = gscRows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = gscRows.reduce((s, r) => s + r.impressions, 0);
  const avgGscPosition =
    gscRows.length > 0
      ? gscRows.reduce((s, r) => s + r.position, 0) / gscRows.length
      : null;

  const ga4Sessions = ga4Rows.reduce((s, r) => s + r.sessions, 0);
  const ga4Users = ga4Rows.reduce((s, r) => s + r.users, 0);

  const playbookTotal = playbookFor(client.niche).length || 1;
  const gbpScore = Math.round(
    ((gbpDone[0]?.value ?? 0) / playbookTotal) * 100,
  );

  const [row] = await db
    .insert(clientMetricSnapshots)
    .values({
      clientId: opts.clientId,
      kind: opts.kind,
      healthScore,
      organicClicks: totalClicks || null,
      organicImpressions: totalImpressions || null,
      organicAvgPositionX100:
        avgGscPosition !== null ? Math.round(avgGscPosition * 100) : null,
      ga4Sessions: ga4Rows.length > 0 ? ga4Sessions : null,
      ga4Users: ga4Rows.length > 0 ? ga4Users : null,
      ga4Conversions: ga4Conv ? Math.round(ga4Conv.conversions) : null,
      ga4RevenueX100: ga4Conv ? Math.round(ga4Conv.revenue * 100) : null,
      keywordCount: kwCount[0]?.value ?? 0,
      avgRankX100: rankStats.avgRankX100,
      top10Count: rankStats.top10Count,
      criticalIssues: issues.critical,
      highIssues: issues.high,
      backlinkCount: bl[0]?.value ?? 0,
      gbpScore,
      mentionCount: mentionsRecent[0]?.value ?? 0,
      tasksDoneRecent: tasksDone,
    })
    .returning();
  return row;
}

/**
 * The audit a snapshot describes: the latest full crawl when there is one,
 * otherwise the latest quick crawl. Never the AI audit, whose score and
 * findings measure something else; and never "whichever ran last", which
 * made consecutive snapshots compare a quick crawl with a full one, or a
 * crawl with an AI checklist, and report movement the site never made.
 * Same rule as auditFacts (lib/projects.ts).
 */
async function referenceAudit(
  clientId: number,
): Promise<{ id: number; score: number | null } | null> {
  const done = await db
    .select({ id: audits.id, kind: audits.kind, mode: audits.mode, score: audits.score })
    .from(audits)
    .where(
      and(eq(audits.clientId, clientId), eq(audits.status, "completed"), eq(audits.kind, "crawler")),
    )
    .orderBy(desc(audits.completedAt));
  const { latest: ref } = pickReferenceAudits(done);
  return ref ? { id: ref.id, score: ref.score } : null;
}

async function latestAuditScore(clientId: number): Promise<number | null> {
  return (await referenceAudit(clientId))?.score ?? null;
}

async function rankAggregate(
  clientId: number,
): Promise<{ avgRankX100: number | null; top10Count: number | null }> {
  const kwRows = await db
    .select({ id: keywords.id })
    .from(keywords)
    .where(eq(keywords.clientId, clientId));
  if (kwRows.length === 0) return { avgRankX100: null, top10Count: null };

  // Single batched query — pull all rankings for these keywords, then
  // pick the latest per keyword in memory. Replaces N+1 (one SELECT
  // per keyword) with one SELECT for the whole set.
  const keywordIds = kwRows.map((k) => k.id);
  const allRanks = await db
    .select({
      keywordId: keywordRankings.keywordId,
      position: keywordRankings.position,
      checkedAt: keywordRankings.checkedAt,
    })
    .from(keywordRankings)
    .where(inArray(keywordRankings.keywordId, keywordIds))
    .orderBy(desc(keywordRankings.checkedAt));

  const latestByKw = new Map<number, number>();
  for (const r of allRanks) {
    if (latestByKw.has(r.keywordId)) continue;
    if (r.position != null) latestByKw.set(r.keywordId, r.position);
  }

  let sum = 0;
  let n = 0;
  let top10 = 0;
  for (const pos of latestByKw.values()) {
    sum += pos;
    n++;
    if (pos <= 10) top10++;
  }
  return {
    avgRankX100: n > 0 ? Math.round((sum / n) * 100) : null,
    top10Count: n > 0 ? top10 : null,
  };
}

async function issueCounts(
  clientId: number,
): Promise<{ critical: number; high: number }> {
  const latest = await referenceAudit(clientId);
  if (!latest) return { critical: 0, high: 0 };

  const rows = await db
    .select({ severity: auditIssues.severity })
    .from(auditIssues)
    .where(
      and(
        eq(auditIssues.auditId, latest.id),
        eq(auditIssues.status, "new"),
      ),
    );
  return {
    critical: rows.filter((r) => r.severity === "critical").length,
    high: rows.filter((r) => r.severity === "high").length,
  };
}

async function tasksCompletedSince(
  clientId: number,
  days: number,
): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ value: count() })
    .from(tasks)
    .where(
      and(
        eq(tasks.clientId, clientId),
        eq(tasks.status, "done"),
        gte(tasks.updatedAt, cutoff),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Daily-agent step: snapshot every client whose last snapshot is older
 * than 7 days. Cheap because all data is already in the DB or fetched
 * by other parts of the agent (the GSC / GA4 calls are the only network
 * hops, and those have their own retry/timeout layers).
 */
export async function snapshotStaleClients(): Promise<{
  scanned: number;
  taken: number;
}> {
  const all = await db.select({ id: clients.id }).from(clients);
  let taken = 0;

  // Batched: fetch the most-recent snapshot per client in ONE query
  // rather than O(clients) SELECTs. Then build a Map for O(1) lookup.
  const lastByClient = new Map<number, Date>();
  if (all.length > 0) {
    const recentSnaps = await db
      .select({
        clientId: clientMetricSnapshots.clientId,
        capturedAt: clientMetricSnapshots.capturedAt,
      })
      .from(clientMetricSnapshots)
      .where(
        inArray(
          clientMetricSnapshots.clientId,
          all.map((c) => c.id),
        ),
      )
      .orderBy(desc(clientMetricSnapshots.capturedAt));
    for (const s of recentSnaps) {
      if (!lastByClient.has(s.clientId)) {
        lastByClient.set(s.clientId, s.capturedAt);
      }
    }
  }

  for (const c of all) {
    const latest = lastByClient.get(c.id) ?? null;
    if (
      latest &&
      Date.now() - latest.getTime() < 6.5 * 24 * 60 * 60 * 1000
    ) {
      continue;
    }
    try {
      await captureClientSnapshot({
        clientId: c.id,
        kind: latest ? "weekly" : "baseline",
      });
      taken++;
    } catch {
      continue;
    }
  }
  return { scanned: all.length, taken };
}

/**
 * Comparison shape used by the report renderer: latest snapshot vs
 * baseline (if any) vs prior weekly snapshot (if any).
 */
export type SnapshotComparison = {
  latest: ClientMetricSnapshot | null;
  prior: ClientMetricSnapshot | null;
  baseline: ClientMetricSnapshot | null;
};

export async function loadSnapshotComparison(
  clientId: number,
): Promise<SnapshotComparison> {
  const all = await db
    .select()
    .from(clientMetricSnapshots)
    .where(eq(clientMetricSnapshots.clientId, clientId))
    .orderBy(desc(clientMetricSnapshots.capturedAt))
    .limit(20);

  const latest = all[0] ?? null;
  const prior = all[1] ?? null;
  const baseline = all.find((s) => s.kind === "baseline") ?? null;
  return { latest, prior, baseline };
}
