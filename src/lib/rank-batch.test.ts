import { describe, expect, it } from "vitest";
import { runRankBatch, type RankBatchOutcome } from "./rank-batch";

/**
 * The batch rules, without a browser or a network: who gets a pause,
 * when Google is given up on, and what counts as checked.
 */

function harness(outcomes: RankBatchOutcome[]) {
  const asked: { item: number; skipGoogle: boolean }[] = [];
  const sleeps: number[] = [];
  const run = runRankBatch(
    outcomes.map((_, i) => i),
    async (item, opts) => {
      asked.push({ item, skipGoogle: opts.skipGoogle });
      const o = outcomes[item];
      if (!o) throw new Error("boom");
      return o;
    },
    { sleep: async (ms) => void sleeps.push(ms), delayMs: () => 1234 },
  );
  return { run, asked, sleeps };
}

const ok = (source: "gsc" | "searxng" | "duckduckgo" | "scrape", googleBlocked = false): RankBatchOutcome => ({
  ok: true,
  source,
  googleBlocked,
});
const fail = (googleBlocked = false): RankBatchOutcome => ({ ok: false, googleBlocked });

describe("runRankBatch", () => {
  it("counts a failed check as failed, not checked", async () => {
    // The weekly sweep counted { ok: false } as done, because only a
    // throw was counted. 
    const { run } = harness([ok("searxng"), fail(), fail()]);
    const s = await run;
    expect(s).toMatchObject({ total: 3, checked: 1, failed: 2 });
  });

  it("counts a thrown check as failed too", async () => {
    const outcomes = [ok("gsc"), undefined as unknown as RankBatchOutcome];
    const s = await harness(outcomes).run;
    expect(s).toMatchObject({ checked: 1, failed: 1 });
  });

  it("stops asking Google for the rest of the batch after one block", async () => {
    const h = harness([ok("scrape"), ok("duckduckgo", true), ok("duckduckgo"), fail()]);
    const s = await h.run;
    expect(h.asked.map((a) => a.skipGoogle)).toEqual([false, false, true, true]);
    expect(s.googleAbandoned).toBe(true);
  });

  it("does not give up on Google when it never blocked", async () => {
    const h = harness([ok("scrape"), ok("scrape")]);
    const s = await h.run;
    expect(h.asked.every((a) => !a.skipGoogle)).toBe(true);
    expect(s.googleAbandoned).toBe(false);
  });

  it("pauses after a live search, not after a Search Console answer", async () => {
    // Search Console answers from one prefetched snapshot: no request, no
    // reason to wait. A live engine (or a failed attempt at one) earns a
    // pause before the next keyword.
    const h = harness([ok("gsc"), ok("gsc"), ok("searxng"), fail(), ok("gsc")]);
    await h.run;
    // Pauses before items 3 (after searxng) and 4 (after the failure).
    expect(h.sleeps).toEqual([1234, 1234]);
  });

  it("never pauses before the first keyword", async () => {
    const h = harness([ok("duckduckgo")]);
    await h.run;
    expect(h.sleeps).toEqual([]);
  });

  it("tallies readings per source", async () => {
    const s = await harness([ok("gsc"), ok("searxng"), ok("searxng"), ok("duckduckgo")]).run;
    expect(s.bySource).toEqual({ gsc: 1, searxng: 2, duckduckgo: 1 });
  });

  it("handles an empty list", async () => {
    const s = await harness([]).run;
    expect(s).toEqual({ total: 0, checked: 0, failed: 0, bySource: {}, googleAbandoned: false });
  });
});
