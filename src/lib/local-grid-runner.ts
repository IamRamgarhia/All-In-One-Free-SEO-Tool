/**
 * Scheduled local-grid runner. Walks every enabled schedule whose
 * `lastRanAt` is older than its cadence and runs the grid check for it.
 * Cheap to call from the daily-agent — most schedules sit idle most days.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clients,
  localGridChecks,
  localGridSchedules,
} from "@/db/schema";
import { runLocalGrid } from "./local-grid";
import { logActivity } from "./activity";

const CADENCE_MS: Record<"weekly" | "monthly", number> = {
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export async function runDueLocalGridSchedules(): Promise<{
  ran: number;
  scheduled: number;
}> {
  const all = await db
    .select({
      id: localGridSchedules.id,
      clientId: localGridSchedules.clientId,
      query: localGridSchedules.query,
      centerLat: localGridSchedules.centerLat,
      centerLng: localGridSchedules.centerLng,
      gridSize: localGridSchedules.gridSize,
      spacingM: localGridSchedules.spacingM,
      cadence: localGridSchedules.cadence,
      enabled: localGridSchedules.enabled,
      lastRanAt: localGridSchedules.lastRanAt,
      clientUrl: clients.url,
      clientCountry: clients.country,
      clientLanguage: clients.language,
    })
    .from(localGridSchedules)
    .leftJoin(clients, eq(localGridSchedules.clientId, clients.id))
    .where(eq(localGridSchedules.enabled, true));

  let ran = 0;
  for (const s of all) {
    const interval =
      CADENCE_MS[s.cadence as "weekly" | "monthly"] ?? CADENCE_MS.weekly;
    if (
      s.lastRanAt &&
      Date.now() - s.lastRanAt.getTime() < interval - 60_000
    ) {
      continue;
    }
    if (!s.clientUrl) continue;

    try {
      const result = await runLocalGrid({
        query: s.query,
        domain: s.clientUrl,
        centerLat: s.centerLat / 1_000_000,
        centerLng: s.centerLng / 1_000_000,
        size: s.gridSize,
        spacingM: s.spacingM,
        country: s.clientCountry ?? "US",
        language: s.clientLanguage ?? "en",
      });

      await db.insert(localGridChecks).values({
        clientId: s.clientId,
        query: s.query,
        centerLat: s.centerLat,
        centerLng: s.centerLng,
        gridSize: s.gridSize,
        spacingM: s.spacingM,
        cells: result.cells,
        avgPosition: result.avgPosition,
        inPackPct: result.inPackPct,
      });

      await db
        .update(localGridSchedules)
        .set({ lastRanAt: new Date(), updatedAt: new Date() })
        .where(eq(localGridSchedules.id, s.id));

      await logActivity({
        kind: "rank.changed",
        message: `Local grid auto-ran: ${result.inPackPct}% in pack for "${s.query}"`,
        messageFr: `Grille locale lancée automatiquement : ${result.inPackPct} % des points dans le pack local pour « ${s.query} »`,
        clientId: s.clientId,
        entityType: "local_grid",
      });
      ran++;
    } catch {
      continue;
    }
  }

  return { ran, scheduled: all.length };
}
