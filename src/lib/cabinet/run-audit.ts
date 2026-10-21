/**
 * Background SEOmator audit runner for the cabinet.
 *
 * Flow: create pending run → mark running → call SEOmator → persist
 * raw_report + normalized issues + rule history → compute diff vs previous.
 */

import { and, desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditDiffs,
  auditRuleHistory,
  auditRuns,
  cabinetAuditIssues,
  cabinetSites,
} from "@/db/cabinet/schema";
import { runSeomatorAudit } from "@/lib/seomator-audit";
import { diffRuleStatuses, scoreDelta } from "./diff";
import { normalizeSeomatorReport } from "./normalize";

export type StartAuditOptions = {
  maxPages?: number;
  measureCwv?: boolean;
  crawl?: boolean;
};

export async function createPendingAuditRun(siteId: string) {
  const db = requireCabinetDb();
  const [run] = await db
    .insert(auditRuns)
    .values({
      siteId,
      source: "seomator",
      status: "pending",
    })
    .returning();
  return run;
}

/**
 * Execute a pending/running audit in the background (fire-and-forget safe).
 */
export async function executeAuditRun(
  auditRunId: string,
  options: StartAuditOptions = {},
): Promise<void> {
  const db = requireCabinetDb();

  const [run] = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.id, auditRunId))
    .limit(1);
  if (!run) throw new Error(`Audit run ${auditRunId} not found`);

  const [site] = await db
    .select()
    .from(cabinetSites)
    .where(eq(cabinetSites.id, run.siteId))
    .limit(1);
  if (!site) throw new Error(`Site ${run.siteId} not found`);

  await db
    .update(auditRuns)
    .set({ status: "running", startedAt: new Date(), errorMessage: null })
    .where(eq(auditRuns.id, auditRunId));

  try {
    const seomator = await runSeomatorAudit(site.url, {
      crawl: options.crawl ?? true,
      maxPages: options.maxPages ?? 20,
      concurrency: 3,
      measureCwv: options.measureCwv ?? true,
    });

    const normalized = normalizeSeomatorReport(seomator.raw);

    await db
      .update(auditRuns)
      .set({
        status: "completed",
        globalScore: normalized.globalScore,
        pagesCrawled: normalized.pagesCrawled,
        categoryScores: normalized.categoryScores,
        rawReport: normalized.rawReport,
        finishedAt: new Date(),
      })
      .where(eq(auditRuns.id, auditRunId));

    if (normalized.issues.length > 0) {
      await db.insert(cabinetAuditIssues).values(
        normalized.issues.map((issue) => ({
          auditRunId,
          siteId: site.id,
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
          siteId: site.id,
          ruleId: h.ruleId,
          auditRunId,
          status: h.status,
          score: h.score,
          checkedAt: new Date(),
        })),
      );
    }

    // Diff against the previous completed run for this site (not this one).
    const priorRuns = await db
      .select()
      .from(auditRuns)
      .where(
        and(
          eq(auditRuns.siteId, site.id),
          eq(auditRuns.status, "completed"),
        ),
      )
      .orderBy(desc(auditRuns.finishedAt))
      .limit(2);

    const prior = priorRuns.find((r) => r.id !== auditRunId) ?? null;
    if (prior) {
      const priorHistory = await db
        .select()
        .from(auditRuleHistory)
        .where(eq(auditRuleHistory.auditRunId, prior.id));
      const prevMap: Record<string, string> = {};
      for (const h of priorHistory) {
        if (h.ruleId && h.status) prevMap[h.ruleId] = h.status;
      }
      const diff = diffRuleStatuses(prevMap, normalized.ruleStatusMap);
      const catDeltas: Record<string, number> = {};
      const prevCats = (prior.categoryScores ?? {}) as Record<
        string,
        { score: number }
      >;
      for (const [cat, val] of Object.entries(normalized.categoryScores)) {
        const before = prevCats[cat]?.score;
        if (typeof before === "number") catDeltas[cat] = val.score - before;
      }

      await db.insert(auditDiffs).values({
        siteId: site.id,
        previousAuditId: prior.id,
        currentAuditId: auditRunId,
        fixedRules: diff.fixedRules,
        regressedRules: diff.regressedRules,
        newIssues: diff.newIssues,
        worsenedRules: diff.worsenedRules,
        scoreDelta: scoreDelta(prior.globalScore, normalized.globalScore),
        categoryDeltas: catDeltas,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(auditRuns)
      .set({
        status: "failed",
        errorMessage: message.slice(0, 4000),
        finishedAt: new Date(),
      })
      .where(eq(auditRuns.id, auditRunId));
    throw err;
  }
}

/**
 * Create a run and kick it off without blocking the HTTP response.
 */
export async function enqueueSiteAudit(
  siteId: string,
  options: StartAuditOptions = {},
) {
  const run = await createPendingAuditRun(siteId);
  // Detached — errors are persisted on the run row.
  void executeAuditRun(run.id, options).catch((err) => {
    console.error(`[cabinet] audit ${run.id} failed:`, err);
  });
  return run;
}
