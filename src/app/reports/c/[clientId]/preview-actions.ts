"use server";

import { requireSignedIn } from "@/lib/action-guard";

import { eq, desc, and } from "drizzle-orm";
import { OPEN_ISSUE_STATUS, pickReferenceAudits } from "@/lib/reference-audit";
import { db } from "@/db/client";
import { audits, auditIssues, clients, tasks } from "@/db/schema";
import { generateExecSummary, type ExecSummaryDataPoint } from "@/lib/ai-summary";
import {
  getGa4OrganicTraffic,
  getGscQuickWins,
  getGscTopQueries,
  type Ga4DailyTraffic,
  type GscKeyword,
} from "@/lib/google-data";
import { isOpenTask } from "@/lib/task-status";
import { getTranslations } from "next-intl/server";

const severityRank = (s: string) =>
  ({ critical: 4, high: 3, medium: 2, low: 1 })[s] ?? 0;

export type ExecPreviewResult =
  | {
      ok: true;
      summary: string;
      /**
       * Deterministic citations for the summary. Render them next to the
       * preview so the user can verify each claim before sending the
       * report. Same data points appear in the PDF.
       */
      dataPoints: ExecSummaryDataPoint[];
      /** "ai" if a real model produced the prose; "template" if fallback. */
      source: "ai" | "template";
    }
  | { ok: false; error: string };

/**
 * Pulls the same signals the PDF generator uses, then runs the AI
 * exec-summary helper. Used by the report-preview page so users can
 * read + give feedback on the summary before sending the report.
 */
export async function previewExecSummary(
  clientId: number,
): Promise<ExecPreviewResult> {
  await requireSignedIn();
  const t = await getTranslations("auditUi.reports.preview");
  if (!Number.isFinite(clientId) || clientId <= 0)
    return { ok: false, error: t("invalidClient") };

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: t("clientNotFound") };

  const completedAudits = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt));
  // The reference audit and the previous one of the same mode, never the
  // AI checklist (lib/reference-audit.ts).
  const { latest, previous } = pickReferenceAudits(completedAudits);

  const allIssues = latest
    ? await db
        .select()
        .from(auditIssues)
        .where(and(eq(auditIssues.auditId, latest.id), eq(auditIssues.status, OPEN_ISSUE_STATUS)))
    : [];

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, clientId));

  const doneTasks = allTasks.filter((t) => t.status === "done");
  const openTasks = allTasks.filter((t) => isOpenTask(t.status));

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

  return {
    ok: true,
    summary: summary.prose,
    dataPoints: summary.dataPoints,
    source: summary.source,
  };
}
