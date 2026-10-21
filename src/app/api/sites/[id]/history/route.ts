import { desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { auditDiffs, auditRuleHistory, auditRuns } from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const db = requireCabinetDb();

    const runs = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.siteId, id))
      .orderBy(desc(auditRuns.createdAt))
      .limit(50);

    const diffs = await db
      .select()
      .from(auditDiffs)
      .where(eq(auditDiffs.siteId, id))
      .orderBy(desc(auditDiffs.createdAt))
      .limit(20);

    const latestCompleted = runs.find((r) => r.status === "completed");
    let latestRules: { ruleId: string; status: string | null; score: number | null }[] =
      [];
    if (latestCompleted) {
      latestRules = await db
        .select({
          ruleId: auditRuleHistory.ruleId,
          status: auditRuleHistory.status,
          score: auditRuleHistory.score,
        })
        .from(auditRuleHistory)
        .where(eq(auditRuleHistory.auditRunId, latestCompleted.id));
    }

    return jsonOk({ runs, diffs, latestRules });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
