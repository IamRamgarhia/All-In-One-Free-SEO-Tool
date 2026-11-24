import { describe, expect, it, vi } from "vitest";

vi.mock("./rank-checker", () => ({ checkRank: vi.fn() }));
vi.mock("./serp", () => ({ configuredKeylessProviders: vi.fn(async () => []) }));
vi.mock("./rank-gsc", () => ({
  fetchGscRankForQuery: vi.fn(),
  fetchGscRankSnapshot: vi.fn(),
  rankKey: (q: string, d: string) => `${q}|${d}`,
}));

import { fromCheckRank } from "./rank-resolve";
import type { RankCheckResult } from "./rank-checker";

/**
 * The source recorded for a reading has to follow the engine that
 * answered. Before, every non-API answer was stored as "scrape" — so a
 * DuckDuckGo first page (about ten results) was shown, charted and
 * compared as a Google position.
 */

const base: RankCheckResult = {
  query: "q",
  domain: "example.com",
  engine: "google",
  position: null,
  url: null,
  checkedAt: new Date("2026-11-24T10:00:00Z"),
  device: "desktop",
  resultsScanned: 0,
};
const now = new Date("2026-11-24T10:00:00Z");
const opts = { query: "q", device: "desktop" as const };

describe("fromCheckRank", () => {
  it("records a DuckDuckGo answer as DuckDuckGo, with what was read", () => {
    const r = fromCheckRank(
      {
        ...base,
        engine: "duckduckgo",
        resultsScanned: 10,
        failures: [{ engine: "google", code: "blocked" }],
      },
      opts,
      now,
      [],
    );
    expect(r).toMatchObject({
      source: "duckduckgo",
      engine: "duckduckgo",
      position: null,
      resultsScanned: 10,
      googleBlocked: true,
    });
  });

  it("records a completed Google scan as a browser reading", () => {
    const r = fromCheckRank({ ...base, position: 4, url: "https://example.com/", resultsScanned: 40 }, opts, now, []);
    expect(r).toMatchObject({ source: "scrape", engine: "google", position: 4, googleBlocked: false });
    expect(r.failures).toEqual([]);
  });

  it("records the paid API as api", () => {
    const r = fromCheckRank({ ...base, provider: "serper", position: 2, resultsScanned: 100 }, opts, now, []);
    expect(r.source).toBe("api");
  });

  it("has no source at all when nothing answered", () => {
    // Not "scrape" with a null position — which every chart reads as
    // "not ranking". The caller stores this as a failure instead.
    const r = fromCheckRank(
      {
        ...base,
        engine: "duckduckgo",
        error: "both failed",
        failures: [
          { engine: "google", code: "blocked" },
          { engine: "duckduckgo", code: "blocked" },
        ],
      },
      opts,
      now,
      [{ engine: "searxng", code: "network" }],
    );
    expect(r.source).toBeNull();
    expect(r.position).toBeNull();
    expect(r.failures.map((f) => f.engine)).toEqual(["searxng", "google", "duckduckgo"]);
    expect(r.googleBlocked).toBe(true);
  });

  it("keeps a position seen before a block", () => {
    const r = fromCheckRank(
      { ...base, position: 3, resultsScanned: 20, error: "cut short", failures: [{ engine: "google", code: "truncated", scanned: 20 }] },
      opts,
      now,
      [],
    );
    expect(r).toMatchObject({ source: "scrape", position: 3 });
  });
});
