"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clients, keywords, serpScans } from "@/db/schema";
import { scanSerp } from "@/lib/serp-scanner";

export type RunSerpScanResult =
  | { ok: true; id: number; aiOverviewPresent: boolean; topResults: number }
  | { ok: false; error: string };

export async function runSerpScan(
  keywordId: number,
): Promise<RunSerpScanResult> {
  const [k] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.id, keywordId))
    .limit(1);
  if (!k) return { ok: false, error: "Keyword not found" };

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, k.clientId))
    .limit(1);

  const result = await scanSerp({
    query: k.query,
    country: k.country,
    clientDomain: client?.url,
  });

  const [row] = await db
    .insert(serpScans)
    .values({
      keywordId: k.id,
      ok: result.ok,
      error: result.error ?? null,
      aiOverviewPresent: result.aiOverviewPresent,
      aiOverviewText: result.aiOverviewText,
      aiOverviewSources: result.aiOverviewSources,
      paaQuestions: result.paaQuestions,
      relatedSearches: result.relatedSearches,
      topResults: result.topResults,
      featuredSnippet: result.featuredSnippet,
      localPackPresent: result.localPackPresent,
      totalResults: result.totalResults,
    })
    .returning({ id: serpScans.id });

  revalidatePath(`/keywords/c/${k.clientId}`);
  revalidatePath(`/keywords/${k.id}/serp`);

  if (!result.ok) {
    return { ok: false, error: result.error ?? "SERP scan failed" };
  }

  return {
    ok: true,
    id: row.id,
    aiOverviewPresent: result.aiOverviewPresent,
    topResults: result.topResults.length,
  };
}
