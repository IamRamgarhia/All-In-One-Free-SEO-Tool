import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditRuleHistory,
  auditRuns,
  cabinetAuditIssues,
} from "@/db/cabinet/schema";
import { jsonError, jsonOk, readJson } from "@/lib/cabinet/api";
import { normalizeSeomatorReport } from "@/lib/cabinet/normalize";
import type { AuditResult as SeomatorAuditResult } from "@seomator/seo-audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/audits/:id/import
 * Import a pre-computed SEOmator JSON report into an existing run
 * (or replace raw_report on a completed run).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ report?: SeomatorAuditResult }>(request);
    if (!body.report) return jsonError("report is required");

    const db = requireCabinetDb();
    const [run] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.id, id))
      .limit(1);
    if (!run) return jsonError("Audit not found", 404);

    const normalized = normalizeSeomatorReport(body.report);

    await db
      .update(auditRuns)
      .set({
        status: "completed",
        globalScore: normalized.globalScore,
        pagesCrawled: normalized.pagesCrawled,
        categoryScores: normalized.categoryScores,
        rawReport: normalized.rawReport,
        finishedAt: new Date(),
        startedAt: run.startedAt ?? new Date(),
      })
      .where(eq(auditRuns.id, id));

    // Replace issues / history for this run
    await db
      .delete(cabinetAuditIssues)
      .where(eq(cabinetAuditIssues.auditRunId, id));
    await db
      .delete(auditRuleHistory)
      .where(eq(auditRuleHistory.auditRunId, id));

    if (normalized.issues.length > 0) {
      await db.insert(cabinetAuditIssues).values(
        normalized.issues.map((issue) => ({
          auditRunId: id,
          siteId: run.siteId,
          ruleId: issue.ruleId,
          category: issue.category,
          status: issue.status,
          severity: issue.severity,
          title: issue.title,
          description: issue.description,
          recommendation: issue.recommendation,
          affectedUrls: issue.affectedUrls,
        })),
      );
    }

    if (normalized.history.length > 0) {
      await db.insert(auditRuleHistory).values(
        normalized.history.map((h) => ({
          siteId: run.siteId,
          ruleId: h.ruleId,
          auditRunId: id,
          status: h.status,
          score: h.score,
          checkedAt: new Date(),
        })),
      );
    }

    return jsonOk({
      ok: true,
      globalScore: normalized.globalScore,
      issuesCount: normalized.issues.length,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
