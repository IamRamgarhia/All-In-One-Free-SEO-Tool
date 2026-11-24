import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { keywordRankFailures, keywordRankings, keywords, clients } from "@/db/schema";
import { rankStatus, readingEngine } from "@/lib/serp/absence";
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
  const clientId = url.searchParams.get("clientId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);
  const cid = clientId ? Number(clientId) : null;

  const baseQ = db
    .select({
      id: keywords.id,
      query: keywords.query,
      country: keywords.country,
      clientId: keywords.clientId,
      clientName: clients.name,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .limit(limit);

  const kwRows = cid ? await baseQ.where(eq(keywords.clientId, cid)) : await baseQ;

  // Latest rank per keyword — scoped to the keywords this caller asked
  // about, and capped to avoid pulling years of ranking history into
  // memory for the dedup. 10 most-recent rows per keyword is plenty to
  // find the latest, even allowing for same-day duplicates.
  const latestRanks = new Map<
    number,
    {
      position: number | null;
      checkedAt: Date;
      source: string | null;
      engine: string | null;
      resultsScanned: number | null;
    }
  >();
  const lastFailure = new Map<number, Date>();
  if (kwRows.length > 0) {
    const kwIds = kwRows.map((k) => k.id);
    const rankRows = await db
      .select()
      .from(keywordRankings)
      .where(inArray(keywordRankings.keywordId, kwIds))
      .orderBy(desc(keywordRankings.checkedAt))
      .limit(kwIds.length * 10);
    for (const r of rankRows) {
      if (!latestRanks.has(r.keywordId)) {
        latestRanks.set(r.keywordId, {
          position: r.position,
          checkedAt: r.checkedAt,
          source: r.source,
          engine: r.engine,
          resultsScanned: r.resultsScanned,
        });
      }
    }
    const failureRows = await db
      .select({ keywordId: keywordRankFailures.keywordId, checkedAt: keywordRankFailures.checkedAt })
      .from(keywordRankFailures)
      .where(inArray(keywordRankFailures.keywordId, kwIds))
      .orderBy(keywordRankFailures.checkedAt);
    for (const f of failureRows) lastFailure.set(f.keywordId, f.checkedAt);
  }

  // A null position alone does not say whether the keyword is absent,
  // how far the engine was read, or whether the check failed: the status,
  // engine and depth travel with it (lib/serp/absence).
  const enriched = kwRows.map((k) => {
    const latest = latestRanks.get(k.id);
    return {
      ...k,
      latestPosition: latest?.position ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
      latestStatus: rankStatus(latest, lastFailure.get(k.id)),
      latestSource: latest?.source ?? null,
      latestEngine: latest ? (latest.source === "gsc" ? null : readingEngine(latest).id) : null,
      latestEngineDetail: latest && latest.source !== "gsc" ? readingEngine(latest).detail : null,
      latestResultsScanned: latest?.resultsScanned ?? null,
      lastFailedAt: lastFailure.get(k.id) ?? null,
    };
  });

  return jsonOk({ keywords: enriched, count: enriched.length });
}
