import { describe, expect, it, beforeEach, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * AI spend, aggregated.
 *
 * The /settings/ai-usage page computed its headline figures — total
 * calls, total cost, tokens, the per-day chart, and the month-to-date
 * number shown beside the spend cap — from a `.limit(500)` slice:
 *
 *     const recentCalls = await db.select()...limit(500);
 *     const totalCost = recentCalls.reduce(...);
 *
 * Past 500 calls in the window those stop being totals. The same shape
 * as the Search Console bug fixed earlier the same day, where a top-200
 * query list was summed and labelled as a site's traffic.
 *
 * Enforcement was never affected — checkMonthlyCap sums the month in
 * SQL — so this under-reported rather than overspent. These tests use
 * more than 500 rows precisely because fewer would pass against the
 * old code.
 */

const DAY = 86_400_000;
let dir: string;

/**
 * A throwaway database per test, so this never touches the developer's
 * data.db.
 *
 * `vi.resetModules()` is load-bearing, not hygiene. `@/db/client` opens
 * its connection at module scope from SEO_DB_PATH, so without the reset
 * every test after the first reuses the FIRST test's database and its
 * rows — which showed up as later tests seeing 600 calls they never
 * seeded, and would otherwise have been "fixed" by loosening the
 * assertions until they passed.
 */
function freshDb() {
  dir = mkdtempSync(join(tmpdir(), "seo-usage-"));
  process.env.SEO_DB_PATH = join(dir, "test.db");
  process.env.SEO_DATA_DIR = dir;
  vi.resetModules();
}

beforeEach(() => {
  freshDb();
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* windows file locks */
  }
});

type Row = { at: number; cost: number; feature: string; status: string };

async function seedAndSummarise(rows: Row[], windowDays = 30) {
  const { createRequire } = await import("node:module");
  const require_ = createRequire(join(process.cwd(), "package.json"));
  const Database = require_("better-sqlite3");
  const sqlite = new Database(process.env.SEO_DB_PATH!);
  sqlite.exec(`
    CREATE TABLE ai_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_micros INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      client_id INTEGER,
      status TEXT NOT NULL DEFAULT 'ok',
      error_msg TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL);
  `);
  const ins = sqlite.prepare(
    `INSERT INTO ai_calls (feature, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_micros, status, created_at)
     VALUES (?, 'gemini', 'gemini-2.5-flash', 10, 5, 15, ?, ?, ?)`,
  );
  const tx = sqlite.transaction((all: Row[]) => {
    for (const r of all) ins.run(r.feature, r.cost, r.status, Math.floor(r.at / 1000));
  });
  tx(rows);
  sqlite.close();

  // Imported after SEO_DB_PATH is set and after resetModules, so the db
  // client opens THIS database rather than a previous test's.
  const mod = await import("./ai-usage-summary");
  return (await mod.getAiUsageSummary(windowDays)) as Awaited<
    ReturnType<typeof import("./ai-usage-summary").getAiUsageSummary>
  >;
}

describe("getAiUsageSummary", () => {
  it("totals every call in the window, not the most recent 500", async () => {
    // The bug, at the size that triggers it. 600 calls of 1000 micros
    // is $0.60; the old code reported $0.50 and "500 calls".
    const now = Date.now();
    const rows: Row[] = Array.from({ length: 600 }, (_, i) => ({
      at: now - (i % 20) * DAY - 60_000,
      cost: 1000,
      feature: "general",
      status: "ok",
    }));

    const s = await seedAndSummarise(rows);
    expect(s.calls).toBe(600);
    expect(s.costMicros).toBe(600_000);
    // The number the old code would have produced.
    expect(s.costMicros).not.toBe(500_000);
  });

  it("counts failures separately instead of hiding them", async () => {
    const now = Date.now();
    const s = await seedAndSummarise([
      { at: now - 60_000, cost: 500, feature: "general", status: "ok" },
      { at: now - 60_000, cost: 0, feature: "general", status: "error" },
      { at: now - 60_000, cost: 0, feature: "general", status: "error" },
    ]);
    expect(s.calls).toBe(3);
    expect(s.errorCalls).toBe(2);
    // A failed call still cost nothing, so spend is unaffected — but a
    // summary that omitted the failures would read as a healthy install.
    expect(s.costMicros).toBe(500);
  });

  it("gives every day in the window a row, including silent ones", async () => {
    // A gap and a zero are different things on a chart, and only one of
    // them is true.
    const now = Date.now();
    const s = await seedAndSummarise(
      [{ at: now - 60_000, cost: 100, feature: "general", status: "ok" }],
      7,
    );
    expect(s.daily).toHaveLength(7);
    expect(s.daily.filter((d) => d.calls === 0)).toHaveLength(6);
    expect(s.daily.at(-1)?.calls).toBe(1);
    // Oldest first, so a chart drawn straight from it reads left to right.
    expect([...s.daily].sort((a, b) => a.day.localeCompare(b.day))).toEqual(s.daily);
  });

  it("excludes calls older than the window", async () => {
    const now = Date.now();
    const s = await seedAndSummarise(
      [
        { at: now - 60_000, cost: 100, feature: "general", status: "ok" },
        { at: now - 40 * DAY, cost: 999_999, feature: "general", status: "ok" },
      ],
      30,
    );
    expect(s.calls).toBe(1);
    expect(s.costMicros).toBe(100);
  });

  it("breaks spend down by feature, biggest first", async () => {
    const now = Date.now();
    const s = await seedAndSummarise([
      { at: now - 60_000, cost: 100, feature: "exec_summary", status: "ok" },
      { at: now - 60_000, cost: 900, feature: "content_idea", status: "ok" },
      { at: now - 60_000, cost: 400, feature: "general", status: "ok" },
    ]);
    expect(s.byFeature.map((b) => b.key)).toEqual([
      "content_idea",
      "general",
      "exec_summary",
    ]);
    expect(s.byFeature[0].costMicros).toBe(900);
  });

  it("reports zeroes, not NaN, on an empty ledger", async () => {
    const s = await seedAndSummarise([]);
    for (const v of [s.calls, s.costMicros, s.tokensIn, s.tokensOut, s.errorCalls]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBe(0);
    }
    expect(s.byFeature).toEqual([]);
    expect(s.daily).toHaveLength(30);
  });
});
