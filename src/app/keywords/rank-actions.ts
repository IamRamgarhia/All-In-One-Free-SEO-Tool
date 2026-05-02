"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db/client";
import {
  clients,
  keywordRankings,
  keywords,
  serpScreenshots,
} from "@/db/schema";
import { checkRank, shutdownBrowser } from "@/lib/rank-checker";
import { notify } from "@/lib/notifier";

function screenshotsRoot(): string {
  return (
    process.env.SEO_SCREENSHOTS_DIR ??
    path.join(process.cwd(), "data", "screenshots")
  );
}

export type CheckRankResult =
  | {
      ok: true;
      keywordId: number;
      query: string;
      position: number | null;
      engine: "google" | "duckduckgo";
      previousPosition: number | null;
    }
  | { ok: false; error: string };

export async function checkRankAction(
  keywordId: number,
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
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .where(eq(keywords.id, keywordId))
    .limit(1);

  if (!row || !row.clientUrl) {
    return { ok: false, error: "Keyword or client not found" };
  }

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

  const result = await checkRank(row.query, row.clientUrl, {
    screenshot: wantScreenshot,
  });

  await db.insert(keywordRankings).values({
    keywordId,
    position: result.position,
    url: result.url,
    checkedAt: result.checkedAt,
  });

  // Persist screenshot if we got one (or if position changed meaningfully)
  const positionChangedBigly =
    previousPosition !== null &&
    result.position !== null &&
    Math.abs(result.position - previousPosition) >= 3;

  let buffer = result.screenshotBuffer;
  if (!buffer && positionChangedBigly) {
    // Re-run with screenshot just to capture this state — rare path
    const r2 = await checkRank(row.query, row.clientUrl, { screenshot: true });
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
        { label: "Engine", value: result.engine },
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
    engine: result.engine,
    previousPosition,
  };
}

export async function checkAllRanksAction() {
  const all = await db
    .select({
      id: keywords.id,
      query: keywords.query,
      clientId: keywords.clientId,
      clientUrl: clients.url,
    })
    .from(keywords)
    .leftJoin(clients, eq(keywords.clientId, clients.id));

  const validIds = all
    .filter((k) => k.clientUrl && Number.isFinite(k.id))
    .map((k) => k.id);

  if (validIds.length === 0) return;

  // Sequential to avoid hammering Google. Slow but reliable on a 2-core CPU.
  for (const id of validIds) {
    await checkRankAction(id);
  }

  // Free up Chromium memory once the batch is done
  await shutdownBrowser().catch(() => {});

  revalidatePath("/keywords");
}

export async function clearRankHistoryAction(keywordIds: number[]) {
  if (keywordIds.length === 0) return;
  await db
    .delete(keywordRankings)
    .where(inArray(keywordRankings.keywordId, keywordIds));
  revalidatePath("/keywords");
}
