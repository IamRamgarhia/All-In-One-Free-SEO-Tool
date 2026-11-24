import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordRankings, keywords } from "@/db/schema";
import {
  authenticateRequest,
  jsonError,
  jsonOk,
  requireScope,
} from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = await authenticateRequest(req);
  if (!key) return jsonError(401, "Unauthorized");
  if (!requireScope(key, "read")) return jsonError(403, "Read scope required.");

  const url = new URL(req.url);
  const keywordId = url.searchParams.get("keywordId");
  const clientId = url.searchParams.get("clientId");
  const days = Math.min(Number(url.searchParams.get("days") ?? 90), 365);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 500), 2000);

  if (!keywordId && !clientId) {
    return jsonError(400, "Specify keywordId or clientId");
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const conds = [gte(keywordRankings.checkedAt, since)];
  if (keywordId) conds.push(eq(keywordRankings.keywordId, Number(keywordId)));
  if (clientId) conds.push(eq(keywords.clientId, Number(clientId)));

  const rows = await db
    .select({
      keywordId: keywordRankings.keywordId,
      query: keywords.query,
      country: keywords.country,
      position: keywordRankings.position,
      url: keywordRankings.url,
      checkedAt: keywordRankings.checkedAt,
      hasAiOverview: keywordRankings.hasAiOverview,
      hasFeaturedSnippet: keywordRankings.hasFeaturedSnippet,
      hasLocalPack: keywordRankings.hasLocalPack,
      // A null position is "absent from the first resultsScanned results
      // of this engine", not "not ranked" (lib/serp/absence).
      source: keywordRankings.source,
      engine: keywordRankings.engine,
      resultsScanned: keywordRankings.resultsScanned,
    })
    .from(keywordRankings)
    .leftJoin(keywords, eq(keywordRankings.keywordId, keywords.id))
    .where(and(...conds))
    .orderBy(desc(keywordRankings.checkedAt))
    .limit(limit);

  return jsonOk({ rankings: rows, count: rows.length });
}
