/**
 * Multi-variant title test runner. Each test stores 2-3 candidate titles
 * for a single page; every `variantDurationDays` (default 14d) we
 * rotate to the next variant by pushing it to WordPress and capturing
 * the prior period's GSC stats as a measurement.
 *
 * Once every variant has been measured at least once, we pick the winner
 * by GSC CTR (with a clicks-volume floor to avoid noise) and pin the
 * page to that title.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, titleTests, type TitleTest } from "@/db/schema";
import { fetchGscPerformance } from "./google-oauth";
import { findPostIdByUrl, getClientWpCreds, setPostSeo } from "./wp-bridge";
import { logActivity } from "./activity";

export async function runDueTitleTests(): Promise<{
  rotated: number;
  completed: number;
}> {
  const tests = await db
    .select()
    .from(titleTests)
    .where(eq(titleTests.status, "running"));

  let rotated = 0;
  let completed = 0;

  for (const t of tests) {
    const cycleMs = t.variantDurationDays * 24 * 60 * 60 * 1000;
    const lastRotated = t.lastRotatedAt?.getTime() ?? t.createdAt.getTime();
    if (Date.now() - lastRotated < cycleMs) continue;

    const result = await rotateTest(t);
    if (result.completed) completed++;
    else if (result.rotated) rotated++;
  }

  return { rotated, completed };
}

async function rotateTest(
  t: TitleTest,
): Promise<{ rotated: boolean; completed: boolean }> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, t.clientId))
    .limit(1);
  if (!client?.gscProperty) return { rotated: false, completed: false };

  // Capture the prior period's GSC numbers for the variant that was
  // just running.
  const since = (t.lastRotatedAt ?? t.createdAt).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const measurement = await captureMeasurement({
    siteUrl: client.gscProperty,
    pageUrl: t.pageUrl,
    startDate: since,
    endDate: until,
    variantIdx: t.currentVariantIdx,
    title: t.variants[t.currentVariantIdx]?.title ?? "",
  });

  const newMeasurements = [...(t.measurements ?? []), measurement];

  // Decide what's next: either rotate to the next variant or, if every
  // variant has been measured at least once, pick a winner.
  const variantsMeasured = new Set(
    newMeasurements.map((m) => m.variantIdx),
  );

  if (variantsMeasured.size >= t.variants.length) {
    const winner = pickWinner(newMeasurements);
    await applyVariantToWordPress(t, winner.variantIdx);
    await db
      .update(titleTests)
      .set({
        measurements: newMeasurements,
        status: "completed",
        winnerVariantIdx: winner.variantIdx,
        currentVariantIdx: winner.variantIdx,
        lastRotatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(titleTests.id, t.id));

    await logActivity({
      kind: "rank.changed",
      message: `Title test complete on ${t.pageUrl}: winner is "${t.variants[winner.variantIdx]?.title}" (CTR ${(winner.ctr * 100).toFixed(2)}%)`,
      level: "success",
      clientId: t.clientId,
      entityType: "title_test",
      entityId: t.id,
    });
    return { rotated: false, completed: true };
  }

  const nextIdx = (t.currentVariantIdx + 1) % t.variants.length;
  await applyVariantToWordPress(t, nextIdx);
  await db
    .update(titleTests)
    .set({
      measurements: newMeasurements,
      currentVariantIdx: nextIdx,
      lastRotatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(titleTests.id, t.id));

  return { rotated: true, completed: false };
}

async function captureMeasurement(opts: {
  siteUrl: string;
  pageUrl: string;
  startDate: string;
  endDate: string;
  variantIdx: number;
  title: string;
}): Promise<{
  variantIdx: number;
  title: string;
  startedAt: string;
  endedAt: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number;
}> {
  let clicks = 0;
  let impressions = 0;
  let position = 0;
  try {
    const rows = await fetchGscPerformance({
      siteUrl: opts.siteUrl,
      startDate: opts.startDate,
      endDate: opts.endDate,
      dimensions: ["page"],
      rowLimit: 200,
    });
    const match = rows.find((r) => r.keys[0] === opts.pageUrl);
    if (match) {
      clicks = match.clicks;
      impressions = match.impressions;
      position = match.position;
    }
  } catch {
    // GSC may be unauthorised — silent
  }
  const ctr = impressions > 0 ? clicks / impressions : 0;
  return {
    variantIdx: opts.variantIdx,
    title: opts.title,
    startedAt: opts.startDate,
    endedAt: opts.endDate,
    clicks,
    impressions,
    ctr,
    avgPosition: position,
  };
}

function pickWinner(measurements: TitleTest["measurements"]): {
  variantIdx: number;
  ctr: number;
} {
  // Group by variantIdx, take totals.
  const totals = new Map<
    number,
    { clicks: number; impressions: number }
  >();
  for (const m of measurements ?? []) {
    const cur = totals.get(m.variantIdx) ?? { clicks: 0, impressions: 0 };
    cur.clicks += m.clicks;
    cur.impressions += m.impressions;
    totals.set(m.variantIdx, cur);
  }
  let bestIdx = 0;
  let bestCtr = -1;
  for (const [idx, t] of totals) {
    if (t.impressions < 100) continue; // not enough data
    const ctr = t.clicks / Math.max(1, t.impressions);
    if (ctr > bestCtr) {
      bestCtr = ctr;
      bestIdx = idx;
    }
  }
  if (bestCtr < 0) {
    // No variant hit the impressions floor — keep the first
    return { variantIdx: 0, ctr: 0 };
  }
  return { variantIdx: bestIdx, ctr: bestCtr };
}

async function applyVariantToWordPress(
  t: TitleTest,
  variantIdx: number,
): Promise<void> {
  const newTitle = t.variants[variantIdx]?.title;
  if (!newTitle) return;
  const creds = await getClientWpCreds(t.clientId);
  if (!creds) return;

  let postId = t.wpPostId ?? (await findPostIdByUrl(creds, t.pageUrl));
  if (!postId) return;

  const r = await setPostSeo(creds, postId, { title: newTitle });
  if (!r.ok) return;
  // Mark the variant as applied
  const newVariants = t.variants.map((v, i) =>
    i === variantIdx
      ? { title: v.title, appliedAt: new Date().toISOString() }
      : v,
  );
  await db
    .update(titleTests)
    .set({ variants: newVariants, wpPostId: postId, updatedAt: new Date() })
    .where(eq(titleTests.id, t.id));
}
