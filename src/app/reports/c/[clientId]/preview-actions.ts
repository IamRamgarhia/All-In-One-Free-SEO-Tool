"use server";

import { eq, desc, and } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditIssues, clients, tasks } from "@/db/schema";
import { generateExecSummary } from "@/lib/ai-summary";
import {
  getGa4OrganicTraffic,
  getGscQuickWins,
  getGscTopQueries,
  type Ga4DailyTraffic,
  type GscKeyword,
} from "@/lib/google-data";

const severityRank = (s: string) =>
  ({ critical: 4, high: 3, medium: 2, low: 1 })[s] ?? 0;

export type ExecPreviewResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

/**
 * Pulls the same signals the PDF generator uses, then runs the AI
 * exec-summary helper. Used by the report-preview page so users can
 * read + give feedback on the summary before sending the report.
 */
export async function previewExecSummary(
  clientId: number,
): Promise<ExecPreviewResult> {
  if (!Number.isFinite(clientId) || clientId <= 0)
    return { ok: false, error: "Invalid client" };

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  const completedAudits = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));
  const latest = completedAudits[0] ?? null;
  const previous = completedAudits[1] ?? null;

  const allIssues = latest
    ? await db
        .select()
        .from(auditIssues)
        .where(eq(auditIssues.auditId, latest.id))
    : [];

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, clientId));

  const doneTasks = allTasks.filter((t) => t.status === "done");
  const openTasks = allTasks.filter((t) => t.status !== "done");

  const topIssues = allIssues
    .slice()
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 5)
    .map((i) => ({ type: i.type, severity: i.severity, message: i.message }));

  const [gscTop, gscQuickWins, ga4Daily]: [
    GscKeyword[],
    GscKeyword[],
    Ga4DailyTraffic[],
  ] = await Promise.all([
    client.gscProperty
      ? getGscTopQueries({ siteUrl: client.gscProperty, days: 28, limit: 10 })
      : Promise.resolve([]),
    client.gscProperty
      ? getGscQuickWins({
          siteUrl: client.gscProperty,
          days: 28,
          limit: 8,
          minImpressions: 50,
        })
      : Promise.resolve([]),
    client.ga4PropertyId
      ? getGa4OrganicTraffic({ propertyId: client.ga4PropertyId, days: 28 })
      : Promise.resolve([]),
  ]);

  const totalSessions = ga4Daily.reduce((s, r) => s + r.sessions, 0);
  const half = Math.floor(ga4Daily.length / 2);
  const recentSessions = ga4Daily
    .slice(half)
    .reduce((s, r) => s + r.sessions, 0);
  const priorSessions = ga4Daily
    .slice(0, half)
    .reduce((s, r) => s + r.sessions, 0);
  const sessionsDeltaPct =
    priorSessions > 0
      ? Math.round(((recentSessions - priorSessions) / priorSessions) * 100)
      : null;

  const summary = await generateExecSummary({
    clientId: client.id,
    clientName: client.name,
    clientUrl: client.url,
    score: latest?.score ?? null,
    prevScore: previous?.score ?? null,
    totalTasks: allTasks.length,
    doneTasks: doneTasks.length,
    openTasks: openTasks.length,
    topIssues,
    techStack: client.techStack ?? null,
    niche: client.niche ?? null,
    organicSessions: ga4Daily.length > 0 ? totalSessions : null,
    organicSessionsDeltaPct: sessionsDeltaPct,
    topQueries: gscTop.slice(0, 5).map((q) => ({
      query: q.query,
      clicks: q.clicks,
      position: q.position,
    })),
    quickWinsCount: gscQuickWins.length,
  });

  return { ok: true, summary };
}
