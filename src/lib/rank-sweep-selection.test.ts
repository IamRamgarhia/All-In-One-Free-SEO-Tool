import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings } from "@/db/schema";
import { keywordsNeedingRankCheck } from "./daily-agent";

/**
 * The weekly rank sweep could not check a keyword it had never checked.
 *
 * It selected rows where `keyword_rankings.checked_at` was NOT NULL and
 * older than the cutoff, over a LEFT JOIN — so a keyword with no reading
 * yet produced NULL and was filtered out. A keyword had to already have
 * a rank before it could ever be given one.
 *
 * Nothing errored. The step returned "no stale keywords" and the run was
 * recorded green. The install it was found on had 25 keywords tracked,
 * 25 never checked, and 0 rank readings ever written.
 *
 * Both halves are asserted here: the new keyword gets picked up, and the
 * one checked this morning is left alone even though it also has old
 * readings — the second fault in the same query, where one row per
 * reading meant a busy keyword matched forever on its stale rows.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seed() {
  await db.delete(keywordRankings);
  await db.delete(keywords);
  await db.delete(clients);

  const [client] = await db
    .insert(clients)
    .values({ name: "Test", url: "https://example.com" })
    .returning({ id: clients.id });

  const mk = async (keyword: string) => {
    const [row] = await db
      .insert(keywords)
      .values({ clientId: client.id, query: keyword })
      .returning({ id: keywords.id });
    return row.id;
  };

  const neverChecked = await mk("never checked");
  const checkedToday = await mk("checked today");
  const checkedLongAgo = await mk("checked long ago");

  // Checked this morning — and also months ago, which is what broke the
  // old query.
  for (const ago of [2 * HOUR, 90 * DAY]) {
    await db.insert(keywordRankings).values({
      keywordId: checkedToday,
      position: 7,
      checkedAt: new Date(Date.now() - ago),
    });
  }

  await db.insert(keywordRankings).values({
    keywordId: checkedLongAgo,
    position: 12,
    checkedAt: new Date(Date.now() - 30 * DAY),
    source: "scrape",
  });

  return { neverChecked, checkedToday, checkedLongAgo };
}

describe("which keywords the weekly sweep picks up", () => {
  let ids: Awaited<ReturnType<typeof seed>>;

  beforeEach(async () => {
    ids = await seed();
  });

  it("includes a keyword that has never been checked", async () => {
    const picked = await keywordsNeedingRankCheck(new Date(Date.now() - 7 * DAY));
    expect(picked.map((k) => k.id)).toContain(ids.neverChecked);
  });

  it("includes one whose last reading is older than the cutoff", async () => {
    const picked = await keywordsNeedingRankCheck(new Date(Date.now() - 7 * DAY));
    expect(picked.map((k) => k.id)).toContain(ids.checkedLongAgo);
  });

  it("leaves alone one checked today, despite its older readings", async () => {
    const picked = await keywordsNeedingRankCheck(new Date(Date.now() - 7 * DAY));
    expect(picked.map((k) => k.id)).not.toContain(ids.checkedToday);
  });

  it("returns each keyword once, not once per reading", async () => {
    const picked = await keywordsNeedingRankCheck(new Date(Date.now() - 7 * DAY));
    expect(new Set(picked.map((k) => k.id)).size).toBe(picked.length);
  });

  it("respects the limit, so one sweep cannot hammer a search engine", async () => {
    const picked = await keywordsNeedingRankCheck(new Date(Date.now() - 7 * DAY), 1);
    expect(picked).toHaveLength(1);
  });
});
