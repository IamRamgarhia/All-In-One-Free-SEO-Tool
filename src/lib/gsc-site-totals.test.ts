import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * The snapshot writer's "organic clicks", "organic impressions" and
 * "average position" were all derived from a top-N query list.
 *
 * getGscTopQueries sends `rowLimit: 200` whatever `limit` it is given,
 * so summing its rows gave the clicks of a site's 200 best queries
 * under a name that claims to be the site's. The shortfall moved
 * whenever the query mix moved — and organicClicks is one of the five
 * metrics snapshot-anomalies runs a z-score over, so the wrong number
 * was also the noisy one.
 *
 * The average had a second problem: Search Console weights position by
 * impressions, and a simple mean over query rows is dominated by the
 * one-impression tail. The two numbers could not be reconciled with
 * anything Google shows.
 *
 * getGscSiteTotals asks Google for the aggregate directly. These tests
 * pin the contract of that call, including the two ways it is allowed
 * to say "nothing" — a real zero and a failure — which must not look
 * the same.
 */

const fetchGscPerformance = vi.fn();

vi.mock("./google-oauth", () => ({
  fetchGscPerformance: (...args: unknown[]) => fetchGscPerformance(...args),
  fetchGa4OrganicOverview: vi.fn(),
}));

let getGscSiteTotals: typeof import("./google-data").getGscSiteTotals;

beforeEach(async () => {
  fetchGscPerformance.mockReset();
  ({ getGscSiteTotals } = await import("./google-data"));
});

afterEach(() => vi.restoreAllMocks());

describe("getGscSiteTotals", () => {
  it("asks for the aggregate row, not a query breakdown", async () => {
    fetchGscPerformance.mockResolvedValue([
      { keys: [], clicks: 812, impressions: 40_120, ctr: 0.0202, position: 12.4 },
    ]);

    await getGscSiteTotals({ siteUrl: "https://example.com", days: 28 });

    const arg = fetchGscPerformance.mock.calls[0][0];
    // Dimensionless. With a dimension, Google returns one row per value
    // and we would be back to summing a capped list.
    expect(arg.dimensions).toEqual([]);
    expect(arg.rowLimit).toBe(1);
  });

  it("returns Google's own totals untouched", async () => {
    fetchGscPerformance.mockResolvedValue([
      { keys: [], clicks: 812, impressions: 40_120, ctr: 0.0202, position: 12.4 },
    ]);

    const t = await getGscSiteTotals({ siteUrl: "https://example.com" });

    // Not recomputed, not re-averaged. Google already weights position
    // by impressions; doing our own arithmetic is how the old number
    // stopped matching the Search Console UI.
    expect(t).toEqual({
      clicks: 812,
      impressions: 40_120,
      position: 12.4,
      ctr: 0.0202,
    });
  });

  it("uses the same lagged window as the per-query helper", async () => {
    // GSC runs about two days behind. If the totals and the query list
    // covered different windows, they could not be shown side by side.
    fetchGscPerformance.mockResolvedValue([]);
    await getGscSiteTotals({ siteUrl: "https://example.com", days: 28 });

    const { startDate, endDate } = fetchGscPerformance.mock.calls[0][0];
    const days =
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000;
    expect(days).toBe(28);
    const lag = Math.round(
      (Date.now() - Date.parse(`${endDate}T00:00:00Z`)) / 86_400_000,
    );
    expect(lag).toBeGreaterThanOrEqual(2);
  });

  it("reports a real zero as zero", async () => {
    // No rows means no impressions in the window. That is a fact about
    // the site, and the anomaly detector needs to see it.
    fetchGscPerformance.mockResolvedValue([]);

    const t = await getGscSiteTotals({ siteUrl: "https://example.com" });
    expect(t).toEqual({ clicks: 0, impressions: 0, position: null, ctr: null });
  });

  it("reports a failure as null, not as zero", async () => {
    // The distinction the whole fix turns on. A failed call recorded as
    // zero clicks is a site that looks like it lost all its traffic.
    fetchGscPerformance.mockRejectedValue(new Error("401 unauthorised"));

    expect(await getGscSiteTotals({ siteUrl: "https://example.com" })).toBeNull();
  });

  it("will not report a position for a window with no impressions", async () => {
    // Google returns position 0 when there is nothing to average. 0 is
    // a better rank than #1 — recording it would be the best-looking
    // number in the table, from the emptiest data.
    fetchGscPerformance.mockResolvedValue([
      { keys: [], clicks: 0, impressions: 0, ctr: 0, position: 0 },
    ]);

    const t = await getGscSiteTotals({ siteUrl: "https://example.com" });
    expect(t?.position).toBeNull();
    expect(t?.ctr).toBeNull();
    expect(t?.clicks).toBe(0);
  });

  it("passes the client scope through for per-client tokens", async () => {
    fetchGscPerformance.mockResolvedValue([]);
    await getGscSiteTotals({ siteUrl: "https://example.com", clientIdScope: 7 });
    expect(fetchGscPerformance.mock.calls[0][0].clientIdScope).toBe(7);
  });
});
