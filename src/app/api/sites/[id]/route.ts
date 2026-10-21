import { desc, eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import {
  auditRuns,
  cabinetAuditIssues,
  cabinetClients,
  cabinetSites,
} from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const db = requireCabinetDb();
    const [site] = await db
      .select()
      .from(cabinetSites)
      .where(eq(cabinetSites.id, id))
      .limit(1);
    if (!site) return jsonError("Site not found", 404);

    const [client] = await db
      .select()
      .from(cabinetClients)
      .where(eq(cabinetClients.id, site.clientId))
      .limit(1);

    const [latest] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.siteId, id))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);

    let criticalCount = 0;
    if (latest?.status === "completed") {
      const issues = await db
        .select({ severity: cabinetAuditIssues.severity })
        .from(cabinetAuditIssues)
        .where(eq(cabinetAuditIssues.auditRunId, latest.id));
      criticalCount = issues.filter((i) => i.severity === "critical").length;
    }

    return jsonOk({
      site,
      client,
      latestAudit: latest ?? null,
      criticalCount,
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
