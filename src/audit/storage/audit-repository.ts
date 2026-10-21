/**
 * Persist native audit runs into the main SEO-Tool SQLite schema.
 * Uses integer client ids (not a parallel UUID sites table).
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  nativeAuditDiffs,
  nativeAuditIssues,
  nativeAuditRuleHistory,
  nativeAuditRuns,
} from "@/db/schema";
import { diffRuleStatuses } from "@/audit/engine/diff-engine";
import type { AuditRunResult, RuleStatus } from "@/audit/types";

export async function saveNativeAuditRun(input: {
  clientId: number;
  result: AuditRunResult;
}): Promise<{ runId: number; diffId: number | null }> {
  const { clientId, result } = input;

  const [run] = await db
    .insert(nativeAuditRuns)
    .values({
      clientId,
      source: "native-wave1",
      status: "completed",
      mode: result.mode,
      globalScore: result.score.globalScore,
      uncappedScore: result.score.uncappedScore,
      pagesCrawled: result.pagesCrawled,
      issueCount: result.issues.length,
      categoryScores: Object.fromEntries(
        result.score.categories.map((c) => [
          c.categoryId,
          { score: c.score, pass: c.pass, warn: c.warn, fail: c.fail },
        ]),
      ),
      scoreCaps: result.score.caps,
      rawReport: result as unknown as Record<string, unknown>,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
    })
    .returning({ id: nativeAuditRuns.id });

  const runId = run!.id;

  if (result.issues.length > 0) {
    await db.insert(nativeAuditIssues).values(
      result.issues.map((issue) => ({
        runId,
        clientId,
        ruleId: issue.ruleId,
        category: issue.category,
        severity: issue.severity,
        status: issue.status,
        title: issue.title,
        description: issue.description,
        recommendation: issue.recommendation,
        affectedUrls: issue.affectedUrls,
      })),
    );
  }

  const historyRows = Object.entries(result.ruleStatusMap).map(
    ([ruleId, status]) => ({
      clientId,
      runId,
      ruleId,
      status,
      score:
        status === "pass" ? 100 : status === "warn" ? 50 : status === "fail" ? 0 : null,
      checkedAt: result.finishedAt,
    }),
  );
  if (historyRows.length > 0) {
    await db.insert(nativeAuditRuleHistory).values(historyRows);
  }

  // Auto-diff vs previous completed native run for this client.
  const [previous] = await db
    .select()
    .from(nativeAuditRuns)
    .where(
      and(
        eq(nativeAuditRuns.clientId, clientId),
        eq(nativeAuditRuns.status, "completed"),
      ),
    )
    .orderBy(desc(nativeAuditRuns.finishedAt))
    .limit(2);

  // previous[0] is the one we just inserted if ordering includes it — take older.
  const priorRuns = await db
    .select()
    .from(nativeAuditRuns)
    .where(
      and(
        eq(nativeAuditRuns.clientId, clientId),
        eq(nativeAuditRuns.status, "completed"),
      ),
    )
    .orderBy(desc(nativeAuditRuns.finishedAt))
    .limit(2);

  const prior = priorRuns.find((r) => r.id !== runId) ?? null;
  let diffId: number | null = null;

  if (prior) {
    const priorHistory = await db
      .select()
      .from(nativeAuditRuleHistory)
      .where(eq(nativeAuditRuleHistory.runId, prior.id));
    const prevMap: Record<string, RuleStatus> = {};
    for (const row of priorHistory) {
      prevMap[row.ruleId] = row.status as RuleStatus;
    }
    const diff = diffRuleStatuses(prevMap, result.ruleStatusMap);
    const [diffRow] = await db
      .insert(nativeAuditDiffs)
      .values({
        clientId,
        previousRunId: prior.id,
        currentRunId: runId,
        fixedRules: diff.fixedRules,
        regressedRules: diff.regressedRules,
        worsenedRules: diff.worsenedRules,
        newIssues: diff.newIssues,
        scoreDelta: result.score.globalScore - (prior.globalScore ?? 0),
      })
      .returning({ id: nativeAuditDiffs.id });
    diffId = diffRow?.id ?? null;
  }

  void previous;
  return { runId, diffId };
}

export async function listNativeAudits(clientId: number, limit = 20) {
  return db
    .select()
    .from(nativeAuditRuns)
    .where(eq(nativeAuditRuns.clientId, clientId))
    .orderBy(desc(nativeAuditRuns.createdAt))
    .limit(limit);
}

export async function getNativeAudit(runId: number) {
  const [run] = await db
    .select()
    .from(nativeAuditRuns)
    .where(eq(nativeAuditRuns.id, runId))
    .limit(1);
  if (!run) return null;
  const issues = await db
    .select()
    .from(nativeAuditIssues)
    .where(eq(nativeAuditIssues.runId, runId));
  return { run, issues };
}
