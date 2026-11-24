"use server";

import { isRankDrop } from "@/lib/rank-drop";
import { runAutomations } from "@/lib/automation-engine";
import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";

import { safeRevalidatePath } from "@/lib/safe-revalidate";
import { and, eq, inArray } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/data-dir";
import { db } from "@/db/client";
import {
  clients,
  keywordRankFailures,
  keywordRankings,
  keywords,
  serpScreenshots,
} from "@/db/schema";
import { checkRank, shutdownBrowser } from "@/lib/rank-checker";
import { comparePositions } from "@/lib/rank-comparison";
import { prefetchGscSnapshot, resolveRank } from "@/lib/rank-resolve";
import { runRankBatch, type RankBatchSummary } from "@/lib/rank-batch";
import type { GscRankLookup } from "@/lib/rank-gsc";
import { describeRankFailures, type RankTx } from "@/lib/serp/describe";
import type { RankFailure } from "@/lib/serp/failure";
import type { RankSource } from "@/lib/serp/sources";
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
      /**
       * The engine(s) that really answered: "google", "duckduckgo",
       * "brave", or SearXNG's list. Was a constant "google" before, even
       * for a DuckDuckGo reading.
       */
      engine: string | null;
      /** How many results were read; a null position means "not in these". */
      resultsScanned: number;
      previousPosition: number | null;
      /** Where the number came from. See src/lib/rank-resolve.ts. */
      source: RankSource;
      /** GSC only: the day it describes, which is not today. */
      dataDate: string | null;
      /** GSC only: impressions behind the average, i.e. how much to trust it. */
      impressions: number | null;
      /** True when Google refused this server during the check. */
      googleBlocked: boolean;
    }
  | {
      ok: false;
      /** Already worded in the reader's language. */
      error: string;
      failures: RankFailure[];
      googleBlocked: boolean;
    };

export async function checkRankAction(
  keywordId: number,
  device?: "desktop" | "mobile",
  /**
   * A GSC snapshot the caller already fetched for this client. Passing it
   * turns a batch run from N API calls into one; omitting it makes this
   * fetch per-query, which is correct for a single manual re-check.
   */
  snapshot?: GscRankLookup | null,
  /** Set by a batch once Google has blocked one of its keywords. */
  batch?: { skipGoogle?: boolean },
): Promise<CheckRankResult> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_keywords_rank-actions");
  const rankTx = (await actionTx("rankCheck")) as unknown as RankTx;
  if (!Number.isFinite(keywordId) || keywordId <= 0) {
    return { ok: false, error: tx("invalidKeywordId"), failures: [], googleBlocked: false };
  }

  const [row] = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      clientId: keywords.clientId,
      clientName: clients.name,
      clientUrl: clients.url,
      kwDevice: keywords.device,
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
    return { ok: false, error: tx("keywordOrClientNotFound"), failures: [], googleBlocked: false };
  }

  // The device asked for, else the keyword's own (a batch used to check
  // every keyword on desktop, mobile ones included).
  const checkDevice: "desktop" | "mobile" =
    device ?? (row.kwDevice === "mobile" ? "mobile" : "desktop");

  // Locale precedence: keyword-specific > client-level > default US/en.
  const locale = {
    country: row.kwCountry || row.clientCountry || "US",
    city: row.kwCity ?? row.clientCity ?? undefined,
    language: row.kwLanguage || row.clientLanguage || "en",
  };

  // Most recent prior reading, with its source: comparing a Search
  // Console average with a DuckDuckGo page is not a movement (see
  // lib/rank-comparison.ts).
  const previous = await db
    .select({
      position: keywordRankings.position,
      source: keywordRankings.source,
    })
    .from(keywordRankings)
    .where(and(eq(keywordRankings.keywordId, keywordId), eq(keywordRankings.device, checkDevice)))
    .orderBy(keywordRankings.checkedAt)
    .all();
  const previousReading = previous.length > 0 ? previous[previous.length - 1] : null;
  const previousPosition = previousReading?.position ?? null;

  // Screenshot on the first check, or when the prior position is unknown.
  const wantScreenshot = previousPosition === null;

  const result = await resolveRank({
    query: row.query,
    domain: row.clientUrl,
    device: checkDevice,
    gscProperty: row.gscProperty,
    clientIdScope: row.clientId,
    screenshot: wantScreenshot,
    snapshot,
    skipGoogle: batch?.skipGoogle,
    ...locale,
  });

  // No source answered: nothing goes into keyword_rankings, where a null
  // position reads as "not ranking" in every chart and report. The
  // failure is kept in its own table so the list can say "not checked"
  // instead of showing the last success as if it were current.
  if (!result.source) {
    await db
      .insert(keywordRankFailures)
      .values({
        keywordId,
        device: checkDevice,
        failures: JSON.stringify(result.failures),
        checkedAt: result.checkedAt,
      })
      .catch(() => {});
    safeRevalidatePath("/keywords");
    return {
      ok: false,
      error: describeRankFailures(rankTx, result.failures),
      failures: result.failures,
      googleBlocked: result.googleBlocked,
    };
  }

  await db.insert(keywordRankings).values({
    keywordId,
    position: result.position,
    url: result.url,
    checkedAt: result.checkedAt,
    device: checkDevice,
    source: result.source,
    engine: result.engine,
    resultsScanned: result.source === "gsc" ? null : result.resultsScanned,
    impressions: result.impressions,
    dataDate: result.dataDate,
  });

  const movement = comparePositions(previousReading, {
    position: result.position,
    source: result.source,
  });

  // Persist a screenshot if we got one, or if the position moved
  // meaningfully *within the same source*.
  const positionChangedBigly = movement.drop !== null && Math.abs(movement.drop) >= 3;

  let buffer = result.screenshotBuffer;
  if (!buffer && positionChangedBigly && result.source === "scrape") {
    // Re-run with screenshot just to capture this state — rare path.
    // Only for a Google browser reading: there is no page of ours to
    // photograph behind any other source.
    const r2 = await checkRank(row.query, row.clientUrl, {
      screenshot: true,
      device: checkDevice,
      skipApi: true,
      ...locale,
    });
    buffer = r2.engine === "google" ? r2.screenshotBuffer : undefined;
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

  // Drop alert: 5+ positions lost, in the same measurement.
  if (movement.drop !== null && movement.drop >= 5) {
    notify({
      title: `Ranking drop — ${row.clientName ?? "Client"}`,
      body: `"${row.query}" fell from #${previousPosition} to #${result.position}.`,
      level: "warning",
      fields: [
        { label: tx("keyword"), value: row.query },
        {
          label: tx("source"),
          value:
            result.source === "gsc"
              ? tx("searchConsole", { dataDate: result.dataDate ?? "" })
              : tx("liveSerpCheck"),
        },
        {
          label: tx("change"),
          value: `▼ ${movement.drop} positions`,
        },
      ],
    }).catch(() => {});
  }

  // The "rank drop" automations (Automations → templates).
  if (movement.comparable && isRankDrop(previousPosition, result.position)) {
    await runAutomations("rank_drop", {
      clientId: row.clientId,
      clientName: row.clientName ?? null,
      data: {
        keyword: row.query,
        from: previousPosition,
        to: result.position,
        url: result.url,
        source: result.source,
      },
    });
  }

  safeRevalidatePath("/keywords");

  return {
    ok: true,
    keywordId,
    query: row.query,
    position: result.position,
    engine: result.engine,
    resultsScanned: result.resultsScanned,
    previousPosition,
    source: result.source,
    dataDate: result.dataDate,
    impressions: result.impressions,
    googleBlocked: result.googleBlocked,
  };
}

export type { RankBatchSummary } from "@/lib/rank-batch";

/**
 * Check tracked keywords — one client's when `clientId` is given (the
 * button on a client's keyword page), else all of them.
 *
 * One Search Console request per client up front, answered from it
 * wherever possible; the live sources only for what it cannot answer.
 * Sequential with a pause between live searches, and Google skipped for
 * the rest of the run once it has blocked one keyword (lib/rank-batch.ts).
 */
export async function checkAllRanksAction(clientId?: number): Promise<RankBatchSummary> {
  await requireSignedIn();
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
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(
      clientId !== undefined && Number.isFinite(clientId)
        ? eq(keywords.clientId, clientId)
        : undefined,
    );

  const valid = all.filter((k) => k.clientUrl && Number.isFinite(k.id));
  if (valid.length === 0) {
    return { total: 0, checked: 0, failed: 0, bySource: {}, googleAbandoned: false };
  }

  // One GSC request per client, not per keyword.
  const snapshots = new Map<number, Awaited<ReturnType<typeof prefetchGscSnapshot>>>();
  for (const cid of new Set(valid.map((k) => k.clientId))) {
    const row = valid.find((k) => k.clientId === cid);
    snapshots.set(
      cid,
      await prefetchGscSnapshot({
        gscProperty: row?.gscProperty,
        clientIdScope: cid,
        country: row?.country ?? undefined,
      }),
    );
  }

  const summary = await runRankBatch(valid, async (k, opts) => {
    const r = await checkRankAction(k.id, undefined, snapshots.get(k.clientId), opts);
    return r.ok
      ? { ok: true, source: r.source, googleBlocked: r.googleBlocked }
      : { ok: false, googleBlocked: r.googleBlocked };
  });

  // Free up Chromium memory once the batch is done. No-op if no browser
  // was ever launched.
  await shutdownBrowser().catch(() => {});

  safeRevalidatePath("/keywords");
  return summary;
}

export async function clearRankHistoryAction(keywordIds: number[]) {
  await requireSignedIn();
  if (keywordIds.length === 0) return;
  await db
    .delete(keywordRankings)
    .where(inArray(keywordRankings.keywordId, keywordIds));
  await db
    .delete(keywordRankFailures)
    .where(inArray(keywordRankFailures.keywordId, keywordIds));
  safeRevalidatePath("/keywords");
}
