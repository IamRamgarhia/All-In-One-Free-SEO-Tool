"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { checkLocalRank, type LocalRankResult } from "@/lib/local-rank";

export type RunLocalRankResult =
  | { ok: true; rows: LocalRankResult[] }
  | { ok: false; error: string };

export async function runLocalRanks(opts: {
  clientId: number;
  query: string;
  cities: string[];
  country?: string;
}): Promise<RunLocalRankResult> {
  if (!opts.query.trim()) return { ok: false, error: "Query is required" };
  if (opts.cities.length === 0)
    return { ok: false, error: "At least one city" };

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  // Run in parallel — Playwright contexts are isolated per-call
  const results = await Promise.all(
    opts.cities.slice(0, 8).map((city) =>
      checkLocalRank({
        query: opts.query.trim(),
        city: city.trim(),
        domain: client.url,
        country: opts.country,
      }),
    ),
  );

  return { ok: true, rows: results };
}
