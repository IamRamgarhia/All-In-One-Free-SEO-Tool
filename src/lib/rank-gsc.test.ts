import { describe, expect, it } from "vitest";
import { mapGscRankRows, rankConfidence, rankKey } from "./rank-gsc";

/**
 * The GSC response is positional: `keys` is an array whose meaning comes
 * entirely from the order of `dimensions` in the request. Nothing in the
 * payload names them. So a reordered request, or an off-by-one here,
 * would attribute every ranking to the wrong query — and would do it
 * silently, producing a chart that looks completely normal and is
 * completely wrong.
 *
 * That is the exact failure class this project keeps finding (the DDG
 * fallback that always said "not ranking", the Google positions that
 * counted anchors instead of results). Hence fixtures.
 */

/** Shape of a real searchAnalytics row for dimensions [date, query, device]. */
function row(
  date: string,
  query: string,
  device: string,
  position: number,
  impressions = 100,
  clicks = 5,
) {
  return { keys: [date, query, device], clicks, impressions, position };
}

describe("mapGscRankRows", () => {
  it("reads date, query and device from the right positions", () => {
    const { rows } = mapGscRankRows([
      row("2026-07-28", "seo tool", "DESKTOP", 4.2),
    ]);
    const hit = rows.get(rankKey("seo tool", "desktop"));
    expect(hit?.query).toBe("seo tool");
    expect(hit?.dataDate).toBe("2026-07-28");
    expect(hit?.position).toBe(4.2);
  });

  it("keeps the newest day per query, not the first or last row", () => {
    // GSC does not guarantee ordering, so this must not depend on it.
    const { rows } = mapGscRankRows([
      row("2026-07-26", "seo tool", "DESKTOP", 9),
      row("2026-07-28", "seo tool", "DESKTOP", 4),
      row("2026-07-27", "seo tool", "DESKTOP", 6),
    ]);
    const hit = rows.get(rankKey("seo tool", "desktop"));
    expect(hit?.position).toBe(4);
    expect(hit?.dataDate).toBe("2026-07-28");
  });

  it("keeps desktop and mobile apart", () => {
    // They genuinely differ — mobile SERPs inject local packs and AI
    // Overviews higher. Collapsing them would average away the thing
    // the user is tracking.
    const { rows } = mapGscRankRows([
      row("2026-07-28", "seo tool", "DESKTOP", 3),
      row("2026-07-28", "seo tool", "MOBILE", 11),
    ]);
    expect(rows.get(rankKey("seo tool", "desktop"))?.position).toBe(3);
    expect(rows.get(rankKey("seo tool", "mobile"))?.position).toBe(11);
  });

  it("folds tablet into desktop rather than dropping it", () => {
    // Tablet gets the desktop SERP layout, and nobody tracks it
    // separately. Dropping the row would lose a real impression.
    const { rows } = mapGscRankRows([
      row("2026-07-28", "seo tool", "TABLET", 5),
    ]);
    expect(rows.get(rankKey("seo tool", "desktop"))?.position).toBe(5);
  });

  it("reports the latest date across the whole response", () => {
    const { latestDate } = mapGscRankRows([
      row("2026-07-20", "a", "DESKTOP", 1),
      row("2026-07-29", "b", "DESKTOP", 2),
      row("2026-07-25", "c", "DESKTOP", 3),
    ]);
    expect(latestDate).toBe("2026-07-29");
  });

  it("returns nothing rather than guessing when there are no rows", () => {
    // An empty property is a real state — a brand-new site with no
    // impressions yet. It must not look like a failure.
    const { rows, latestDate } = mapGscRankRows([]);
    expect(rows.size).toBe(0);
    expect(latestDate).toBeNull();
  });

  it("skips malformed rows instead of throwing", () => {
    const { rows } = mapGscRankRows([
      { keys: [], clicks: 0, impressions: 0, position: 1 },
      { keys: ["2026-07-28"], clicks: 0, impressions: 0, position: 1 },
      row("2026-07-28", "good", "DESKTOP", 2),
    ]);
    expect(rows.size).toBe(1);
    expect(rows.get(rankKey("good", "desktop"))?.position).toBe(2);
  });

  it("treats a missing device dimension as desktop", () => {
    // Callers that request only [date, query] should still work rather
    // than producing a key nothing can look up.
    const { rows } = mapGscRankRows([
      { keys: ["2026-07-28", "seo tool"], clicks: 1, impressions: 9, position: 7 },
    ]);
    expect(rows.get(rankKey("seo tool", "desktop"))?.position).toBe(7);
  });

  it("does not round the position", () => {
    // Rounding belongs at the display layer. Storing 7 instead of 7.49
    // would make a genuine drift from 7.4 to 7.6 invisible.
    const { rows } = mapGscRankRows([
      row("2026-07-28", "seo tool", "DESKTOP", 7.49),
    ]);
    expect(rows.get(rankKey("seo tool", "desktop"))?.position).toBe(7.49);
  });

  it("carries impressions through, since confidence depends on them", () => {
    const { rows } = mapGscRankRows([
      row("2026-07-28", "seo tool", "DESKTOP", 3, 1234, 56),
    ]);
    const hit = rows.get(rankKey("seo tool", "desktop"));
    expect(hit?.impressions).toBe(1234);
    expect(hit?.clicks).toBe(56);
  });
});

describe("rankKey", () => {
  it("is case- and whitespace-insensitive", () => {
    // The user types "SEO Tool" into the tracker; GSC returns "seo tool".
    // If these didn't match, every keyword would fall back to scraping
    // and the whole feature would appear not to work.
    expect(rankKey("  SEO Tool ", "desktop")).toBe(rankKey("seo tool", "desktop"));
  });

  it("separates devices", () => {
    expect(rankKey("x", "desktop")).not.toBe(rankKey("x", "mobile"));
  });
});

describe("rankConfidence", () => {
  it("calls a well-sampled average high confidence", () => {
    expect(rankConfidence(5000).level).toBe("high");
  });

  it("warns when the sample is thin", () => {
    expect(rankConfidence(40).level).toBe("medium");
    expect(rankConfidence(3).level).toBe("low");
  });

  it("says the actual number, so the user can judge for themselves", () => {
    expect(rankConfidence(7).reason).toContain("7");
    expect(rankConfidence(1).reason).toMatch(/1 impression\b/);
  });

  it("never claims confidence in a zero-impression average", () => {
    expect(rankConfidence(0).level).toBe("low");
  });
});
