/**
 * Rebuild src/lib/google-ranking-updates.json from Google's Search Status
 * Dashboard.
 *
 *   npx tsx scripts/sync-google-updates.ts
 *
 * Reads the Ranking history page, then each incident page for its start,
 * end and first announcement. About forty requests, spaced out.
 *
 * The shipped file is what an install with no network, or one that has
 * not run its daily refresh yet, falls back to. The daily refresh only
 * sees roughly the last year (incidents.json), so older history comes
 * from here.
 */

import { writeFileSync } from "node:fs";
import {
  classifyUpdate,
  parseHistoryPage,
  parseIncidentPage,
  RANKING_HISTORY_URL,
  STATUS_ORIGIN,
  type RankingUpdate,
} from "../src/lib/google-status";

async function get(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function main() {
  const rows = parseHistoryPage(await get(RANKING_HISTORY_URL));
  // The page listed 41 in September 2026. Far fewer means the layout
  // changed and the parse is missing rows, not that Google deleted them.
  if (rows.length < 30) {
    throw new Error(`Only ${rows.length} incidents parsed from the history page.`);
  }

  const updates: RankingUpdate[] = [];
  for (const row of rows) {
    const url = `${STATUS_ORIGIN}/incidents/${row.id}`;
    const page = parseIncidentPage(await get(url));
    updates.push({
      id: row.id,
      name: row.name,
      type: classifyUpdate(row.name),
      date: page.date,
      ...(page.endDate ? { endDate: page.endDate } : {}),
      url,
      summary: page.summary,
    });
    await new Promise((r) => setTimeout(r, 250));
  }

  updates.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  writeFileSync(
    "src/lib/google-ranking-updates.json",
    JSON.stringify(
      {
        source: RANKING_HISTORY_URL,
        fetchedAt: new Date().toISOString(),
        timeZone: "US/Pacific",
        updates,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Wrote ${updates.length} updates.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
