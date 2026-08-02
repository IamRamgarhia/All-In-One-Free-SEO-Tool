"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/data-dir";
import { db } from "@/db/client";
import {
  clients,
  keywordRankings,
  keywords,
  serpScreenshots,
} from "@/db/schema";
import { checkRank, shutdownBrowser } from "@/lib/rank-checker";
import { prefetchGscSnapshot, resolveRank } from "@/lib/rank-resolve";
import type { GscRankLookup } from "@/lib/rank-gsc";
import { notify } from "@/lib/notifier";

function screenshotsRoot(): string {
  if (process.env.SEO_SCREENSHOTS_DIR) return process.env.SEO_SCREENSHOTS_DIR;
  // Co-located with the rest of the user's data (DB, encryption key) so
  // a Docker volume backup or a "copy the install folder" backup is
  // complete without needing a separate path.
  return path.join(dataDir(), "screenshots");
}

export type CheckRankResult =
  | {
      ok: true;
      keywordId: number;
      query: string;
      position: number | null;
      engine: "google" | "duckduckgo";
      previousPosition: number | null;
      /** Where the number came from. See src/lib/rank-resolve.ts. */
      source: "gsc" | "scrape";
      /** GSC only: the day it describes, which is not today. */
      dataDate: string | null;
      /** GSC only: impressions behind the average, i.e. how much to trust it. */
      impressions: number | null;
      /** Set when GSC was skipped, explaining why. Worth surfacing. */
      gscSkipReason?: string;
    }
  | { ok: false; error: string };

export async function checkRankAction(
  keywordId: number,
  device: "desktop" | "mobile" = "desktop",
  /**
   * A GSC snapshot the caller already fetched for this client. Passing it
   * turns a batch run from N API calls into one; omitting it makes this
   * fetch per-query, which is correct for a single manual re-check.
   */
  snapshot?: GscRankLookup | null,
): Promise<CheckRankResult> {
  if (!Number.isFinite(keywordId) || keywordId <= 0) {
    return { ok: false, error: "Invalid keyword id" };
  }

  const [row] = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      clientId: keywords.clientId,
      clientName: clients.name,
      clientUrl: clients.url,
      kwCountry: keywords.country,
      kwCity: keywords.city,
      kwLanguage: keywords.language,
      clientCountry: clients.country,
      clientCity: clients.city,
      clientLanguage: clients.language,
      gscProperty: clients.gscProperty,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(eq(keywords.id, keywordId))
    .limit(1);

  if (!row || !row.clientUrl) {
    return { ok: false, error: "Keyword or client not found" };
  }

  // Locale precedence: keyword-specific > client-level > default US/en.
  const locale = {
    country: row.kwCountry || row.clientCountry || "US",
    city: row.kwCity ?? row.clientCity ?? undefined,
    language: row.kwLanguage || row.clientLanguage || "en",
  };

  // Most recent prior reading (for delta + alerts)
  const previous = await db
    .select({ position: keywordRankings.position })
    .from(keywordRankings)
    .where(eq(keywordRankings.keywordId, keywordId))
    .orderBy(keywordRankings.checkedAt)
    .all();
  const previousPosition =
    previous.length > 0 ? previous[previous.length - 1].position : null;

  // Capture screenshot on first check or when previous position is unknown.
  // Subsequent checks only screenshot if we know the position changed by ≥3
  // (we can't know the new position until we run the check, so we always
  // capture if the prior position was null or if there's no prior).
  const wantScreenshot = previousPosition === null;

  // GSC first. Google's own number for this query beats anything we can
  // parse out of a SERP page, costs no browser, and can't be captcha'd.
  // Falls back to scraping when the client hasn't connected Search
  // Console, or when the query got no impressions to read a position from.
  const result = await resolveRank({
    query: row.query,
    domain: row.clientUrl,
    device,
    gscProperty: row.gscProperty,
    clientIdScope: row.clientId,
    screenshot: wantScreenshot,
    snapshot,
    ...locale,
  });

  await db.insert(keywordRankings).values({
    keywordId,
    position: result.position,
    url: result.url,
    checkedAt: result.checkedAt,
    device,
    source: result.source,
    impressions: result.impressions,
    dataDate: result.dataDate,
  });

  // Persist screenshot if we got one (or if position changed meaningfully)
  const positionChangedBigly =
    previousPosition !== null &&
    result.position !== null &&
    Math.abs(result.position - previousPosition) >= 3;

  let buffer = result.screenshotBuffer;
  if (!buffer && positionChangedBigly && result.source === "scrape") {
    // Re-run with screenshot just to capture this state — rare path.
    //
    // Only for scraped results: there is no SERP to photograph when the
    // number came from Search Console, and launching a browser to
    // screenshot a page that had nothing to do with the reading would
    // produce evidence of the wrong thing.
    const r2 = await checkRank(row.query, row.clientUrl, {
      screenshot: true,
      device,
      ...locale,
    });
    buffer = r2.screenshotBuffer;
  }

  if (buffer) {
    try {
      const root = screenshotsRoot();
      const dir = path.join(root, String(keywordId));
      await mkdir(dir, { recursive: true });
      const filename = `${result.checkedAt.getTime()}.jpg`;
      const filePath = path.join(dir, filename);
      await writeFile(filePath, buffer);
      await db.insert(serpScreenshots).values({
        keywordId,
        position: result.position,
        filePath,
        capturedAt: result.checkedAt,
      });
    } catch {
      // Don't fail the rank check if screenshot save fails
    }
  }

  // Score-drop-style alert: if we previously ranked and dropped 5+ positions
  if (
    previousPosition !== null &&
    result.position !== null &&
    result.position - previousPosition >= 5
  ) {
    notify({
      title: `Ranking drop — ${row.clientName ?? "Client"}`,
      body: `"${row.query}" fell from #${previousPosition} to #${result.position}.`,
      level: "warning",
      fields: [
        { label: "Keyword", value: row.query },
        {
          label: "Source",
          value:
            result.source === "gsc"
              ? `Search Console (${result.dataDate})`
              : "Live SERP check",
        },
        {
          label: "Change",
          value: `▼ ${result.position - previousPosition} positions`,
        },
      ],
    }).catch(() => {});
  }

  revalidatePath("/keywords");

  return {
    ok: true,
    keywordId,
    query: row.query,
    position: result.position,
    // Kept for the existing UI. GSC results have no engine in the
    // scraping sense — they are Google by definition.
    engine: "google" as const,
    previousPosition,
    source: result.source,
    dataDate: result.dataDate,
    impressions: result.impressions,
    gscSkipReason: result.gscSkipReason,
  };
}

export type BatchRankSummary = {
  total: number;
  fromGsc: number;
  fromScrape: number;
  failed: number;
};

/**
 * Check every tracked keyword.
 *
 * This is where GSC-first actually changes the product. The old loop ran
 * one headless Chrome navigation per keyword, sequentially, "to avoid
 * hammering Google" — fifty keywords meant fifty browser page loads and
 * several minutes, on hardware CLAUDE.md specifies as a $5 VPS. Google's
 * own numbers for the entire property arrive in ONE request.
 *
 * So: fetch a snapshot per client up front, answer from it wherever we
 * can, and fall back to the browser only for keywords Search Console has
 * nothing to say about — typically the ones the site doesn't rank for at
 * all, which is a much shorter list.
 */
export async function checkAllRanksAction(): Promise<BatchRankSummary> {
  const all = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      clientId: keywords.clientId,
      clientUrl: clients.url,
      gscProperty: clients.gscProperty,
      country: keywords.country,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id));

  const valid = all.filter((k) => k.clientUrl && Number.isFinite(k.id));
  const summary: BatchRankSummary = {
    total: valid.length,
    fromGsc: 0,
    fromScrape: 0,
    failed: 0,
  };
  if (valid.length === 0) return summary;

  // One GSC request per client, not per keyword.
  const snapshots = new Map<number, Awaited<ReturnType<typeof prefetchGscSnapshot>>>();
  for (const clientId of new Set(valid.map((k) => k.clientId))) {
    const row = valid.find((k) => k.clientId === clientId);
    snapshots.set(
      clientId,
      await prefetchGscSnapshot({
        gscProperty: row?.gscProperty,
        clientIdScope: clientId,
        country: row?.country ?? undefined,
      }),
    );
  }

  // Still sequential, because the fallback path launches a browser and
  // parallel Chrome navigations are what turns a 1GB VPS into a swap
  // storm. Keywords answered by the snapshot cost nothing, so in the
  // common case this loop is now fast anyway.
  for (const k of valid) {
    const r = await checkRankAction(k.id, "desktop", snapshots.get(k.clientId));
    if (!r.ok) summary.failed++;
    else if (r.source === "gsc") summary.fromGsc++;
    else summary.fromScrape++;
  }

  // Free up Chromium memory once the batch is done. No-op if every
  // keyword came from GSC and no browser was ever launched.
  await shutdownBrowser().catch(() => {});

  revalidatePath("/keywords");
  return summary;
}

export async function clearRankHistoryAction(keywordIds: number[]) {
  if (keywordIds.length === 0) return;
  await db
    .delete(keywordRankings)
    .where(inArray(keywordRankings.keywordId, keywordIds));
  revalidatePath("/keywords");
}
