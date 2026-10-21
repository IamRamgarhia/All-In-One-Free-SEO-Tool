import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { auditDiffs, auditRuleHistory, auditRuns } from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";
import { diffRuleStatuses, scoreDelta } from "@/lib/cabinet/diff";

export const dynamic = "force-dynamic";

/**
 * GET /api/audits/compare?previous=...&current=...
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const previousId = url.searchParams.get("previous");
    const currentId = url.searchParams.get("current");
    if (!previousId || !currentId) {
      return jsonError("previous and current query params are required");
    }

    const db = requireCabinetDb();
    const [previous] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.id, previousId))
      .limit(1);
    const [current] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.id, currentId))
      .limit(1);

    if (!previous || !current) return jsonError("Audit not found", 404);

    const prevHistory = await db
      .select()
      .from(auditRuleHistory)
      .where(eq(auditRuleHistory.auditRunId, previousId));
    const currHistory = await db
      .select()
      .from(auditRuleHistory)
      .where(eq(auditRuleHistory.auditRunId, currentId));

    const prevMap: Record<string, string> = {};
    for (const h of prevHistory) {
      if (h.ruleId && h.status) prevMap[h.ruleId] = h.status;
    }
    const currMap: Record<string, string> = {};
    for (const h of currHistory) {
      if (h.ruleId && h.status) currMap[h.ruleId] = h.status;
    }

    const diff = diffRuleStatuses(prevMap, currMap);
    const catDeltas: Record<string, number> = {};
    const prevCats = (previous.categoryScores ?? {}) as Record<
      string,
      { score: number }
    >;
    const currCats = (current.categoryScores ?? {}) as Record<
      string,
      { score: number }
    >;
    for (const cat of new Set([
      ...Object.keys(prevCats),
      ...Object.keys(currCats),
    ])) {
      const a = prevCats[cat]?.score;
      const b = currCats[cat]?.score;
      if (typeof a === "number" && typeof b === "number") {
        catDeltas[cat] = b - a;
      }
    }

    // Persist if not already stored for this pair
    const [existing] = await db
      .select({ id: auditDiffs.id })
      .from(auditDiffs)
      .where(eq(auditDiffs.currentAuditId, currentId))
      .limit(1);

    if (!existing) {
      await db.insert(auditDiffs).values({
        siteId: current.siteId,
        previousAuditId: previousId,
        currentAuditId: currentId,
        fixedRules: diff.fixedRules,
        regressedRules: diff.regressedRules,
        newIssues: diff.newIssues,
        worsenedRules: diff.worsenedRules,
        scoreDelta: scoreDelta(previous.globalScore, current.globalScore),
        categoryDeltas: catDeltas,
      });
    }

    return jsonOk({
      previous: {
        id: previous.id,
        globalScore: previous.globalScore,
        categoryScores: previous.categoryScores,
      },
      current: {
        id: current.id,
        globalScore: current.globalScore,
        categoryScores: current.categoryScores,
      },
      scoreDelta: scoreDelta(previous.globalScore, current.globalScore),
      categoryDeltas: catDeltas,
      ...diff,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
