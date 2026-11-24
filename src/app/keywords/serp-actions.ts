"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { clients, keywordRankings, keywords, serpScans } from "@/db/schema";
import { scanSerp } from "@/lib/serp-scanner";

export type RunSerpScanResult =
  | { ok: true; id: number; aiOverviewPresent: boolean; topResults: number }
  | { ok: false; error: string };

export async function runSerpScan(
  keywordId: number,
): Promise<RunSerpScanResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_keywords_serp-actions");
  const [k] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.id, keywordId))
    .limit(1);
  if (!k) return { ok: false, error: tx("keywordNotFound") };

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

  // Mirror SERP feature flags onto the latest keyword_rankings row so the
  // keyword table can render them inline next to the rank.
  if (result.ok) {
    const [latest] = await db
      .select({ id: keywordRankings.id })
      .from(keywordRankings)
      .where(eq(keywordRankings.keywordId, k.id))
      .orderBy(desc(keywordRankings.checkedAt))
      .limit(1);

    const flags = {
      hasAiOverview: result.aiOverviewPresent,
      hasFeaturedSnippet: !!result.featuredSnippet,
      hasLocalPack: result.localPackPresent,
      paaCount: result.paaQuestions.length,
    };
    // Only onto a real reading. Inserting a stub row with no position for
    // a keyword never checked put "not in the results" into its history
    // and charts. The scan itself stays on the keyword's SERP page.
    if (latest) {
      await db
        .update(keywordRankings)
        .set(flags)
        .where(eq(keywordRankings.id, latest.id));
    }
  }

  revalidatePath(`/keywords/c/${k.clientId}`);
  revalidatePath(`/keywords/${k.id}/serp`);

  if (!result.ok) {
    return { ok: false, error: result.error ?? tx("serpScanFailed") };
  }

  return {
    ok: true,
    id: row.id,
    aiOverviewPresent: result.aiOverviewPresent,
    topResults: result.topResults.length,
  };
}
