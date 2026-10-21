import { desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { auditRuns } from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const db = requireCabinetDb();
    const audits = await db
      .select({
        id: auditRuns.id,
        status: auditRuns.status,
        globalScore: auditRuns.globalScore,
        source: auditRuns.source,
        pagesCrawled: auditRuns.pagesCrawled,
        startedAt: auditRuns.startedAt,
        finishedAt: auditRuns.finishedAt,
        createdAt: auditRuns.createdAt,
        errorMessage: auditRuns.errorMessage,
      })
      .from(auditRuns)
      .where(eq(auditRuns.siteId, id))
      .orderBy(desc(auditRuns.createdAt));
    return jsonOk({ audits });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
