import { requireCabinetDb } from "@/db/cabinet/client";
import { cabinetSites } from "@/db/cabinet/schema";
import { jsonError, jsonOk, readJson } from "@/lib/cabinet/api";
import { enqueueSiteAudit } from "@/lib/cabinet/run-audit";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * POST /api/audits
 * Body: { siteId, maxPages?, measureCwv?, crawl? }
 * Creates a pending run and executes SEOmator in the background.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{
      siteId?: string;
      maxPages?: number;
      measureCwv?: boolean;
      crawl?: boolean;
    }>(request);

    if (!body.siteId) return jsonError("siteId is required");

    const db = requireCabinetDb();
    const [site] = await db
      .select({ id: cabinetSites.id })
      .from(cabinetSites)
      .where(eq(cabinetSites.id, body.siteId))
      .limit(1);
    if (!site) return jsonError("Site not found", 404);

    const run = await enqueueSiteAudit(body.siteId, {
      maxPages: body.maxPages,
      measureCwv: body.measureCwv,
      crawl: body.crawl,
    });

    return jsonOk({ audit: run }, { status: 202 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed", 500);
  }
}
