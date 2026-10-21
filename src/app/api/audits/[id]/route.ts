import { eq } from "drizzle-orm";
import { requireCabinetDb } from "@/db/cabinet/client";
import { auditRuns, cabinetSites } from "@/db/cabinet/schema";
import { jsonError, jsonOk } from "@/lib/cabinet/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const db = requireCabinetDb();
    const [audit] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.id, id))
      .limit(1);
    if (!audit) return jsonError("Audit not found", 404);

    const [site] = await db
      .select()
      .from(cabinetSites)
      .where(eq(cabinetSites.id, audit.siteId))
      .limit(1);

    return jsonOk({ audit, site });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
