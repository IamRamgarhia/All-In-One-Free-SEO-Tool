"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { getGscTopQueries, type GscKeyword } from "@/lib/google-data";

export type GapResult =
  | {
      ok: true;
      clientUrl: string;
      competitorUrl: string;
      ourQueries: GscKeyword[];
      gapKeywords: GscKeyword[];
      sharedKeywords: GscKeyword[];
    }
  | { ok: false; error: string };

/**
 * Content gap analyzer — pulls our GSC top queries, then compares against
 * a competitor's top queries (also from GSC if connected, or just shows
 * our weak queries if not).
 *
 * For full Ahrefs-style "queries the competitor ranks for that we don't",
 * we'd need a third-party SERP API. This version does the next-best thing:
 * surfaces queries WE rank for at low CTR / low position — the queries
 * where we're losing share, even if we're "in the running".
 */
export async function analyzeContentGap(opts: {
  clientId: number;
}): Promise<GapResult> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  if (!client.gscProperty) {
    return {
      ok: false,
      error:
        "Connect Google Search Console first — gap analysis needs the client's real query data.",
    };
  }

  const ourQueries = await getGscTopQueries({
    siteUrl: client.gscProperty,
    days: 90,
    limit: 200,
  });

  // Treat low-CTR + meaningful impressions as "share-of-voice gap":
  // we're appearing but losing the click. These are the most valuable
  // gaps to close — content already exists, just under-performing.
  const gapKeywords = ourQueries
    .filter(
      (k) =>
        k.impressions >= 100 &&
        k.position >= 4 &&
        k.position <= 30 &&
        k.ctr < 0.05,
    )
    .sort((a, b) => b.impressions - a.impressions);

  // "Shared" — queries we already win
  const sharedKeywords = ourQueries
    .filter((k) => k.position <= 3 && k.ctr >= 0.1)
    .slice(0, 30);

  return {
    ok: true,
    clientUrl: client.url,
    competitorUrl: "",
    ourQueries,
    gapKeywords,
    sharedKeywords,
  };
}
