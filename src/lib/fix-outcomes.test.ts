/**
 * Measuring what the agent's changes did.
 *
 * This is the feature most likely to turn into a tool flattering
 * itself, so almost every test here is about a refusal. The four rules
 * it must not break:
 *
 *   1. don't read a result before 28 full days of "after" exist
 *   2. don't call a measurement a cause
 *   3. don't turn 3 impressions → 6 into "+100%"
 *   4. don't report wins more prominently than losses
 *
 * Breaking any of them produces a report that is confident, specific and
 * wrong — and this one would be quoted to a paying client.
 */

import { describe, expect, it } from "vitest";
import {
  WINDOW_DAYS,
  daysUntilMeasurable,
  outcomeFor,
  rollupOutcomes,
  windowsFor,
  type FixWindow,
  type PeriodMetrics,
} from "./fix-outcomes";

const NOW = new Date("2026-11-19T12:00:00Z");

const fix = (appliedAt: string): FixWindow => ({
  actionId: 1,
  url: "https://example.com/page",
  kind: "write_title",
  appliedAt: new Date(appliedAt),
});

const m = (clicks: number, impressions: number, position = 0): PeriodMetrics => ({
  clicks,
  impressions,
  position,
});

describe("it refuses to read a result too early", () => {
  it("a change made yesterday has no windows", () => {
    expect(windowsFor(new Date("2026-11-18T00:00:00Z"), NOW)).toBeNull();
  });

  it("a change made 20 days ago still has no windows", () => {
    // The tempting case: there IS data, just not 28 days of it. Reading
    // it is how a report claims a lift from a fortnight of weather.
    expect(windowsFor(new Date("2026-10-30T00:00:00Z"), NOW)).toBeNull();
  });

  it("a change made 40 days ago does", () => {
    const w = windowsFor(new Date("2026-10-10T00:00:00Z"), NOW);
    expect(w).toBeTruthy();
    expect(w!.after.start).toBe("2026-10-11");
    expect(w!.after.end).toBe("2026-11-07");
  });

  it("the before window ends the day before the change, and the after starts the day after", () => {
    // The day of the change contains hours from both states. Counted on
    // either side it contaminates that side; excluded, both windows are
    // clean.
    const w = windowsFor(new Date("2026-10-10T00:00:00Z"), NOW)!;
    expect(w.before.end).toBe("2026-10-09");
    expect(w.after.start).toBe("2026-10-11");
  });

  it("both windows are the same length", () => {
    const w = windowsFor(new Date("2026-10-01T00:00:00Z"), NOW)!;
    const days = (a: string, b: string) =>
      (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1;
    expect(days(w.before.start, w.before.end)).toBe(WINDOW_DAYS);
    expect(days(w.after.start, w.after.end)).toBe(WINDOW_DAYS);
  });

  it("respects Search Console's two-day reporting lag, exactly at the boundary", () => {
    // Without the lag the newest window would include days Google has
    // not finished counting, making a busy page look like it collapsed.
    //
    // With NOW = 19 Nov, the last usable day is 17 Nov. So a change on
    // 20 Oct has an after-window of 21 Oct–17 Nov, which lands exactly
    // on the boundary and IS measurable; one day later is not.
    //
    // My first version of this test asserted the opposite and was wrong
    // by one day — the code was right. Worth keeping as an explicit
    // boundary pair rather than a single assertion that could pass for
    // the wrong reason.
    const onBoundary = windowsFor(new Date("2026-10-20T00:00:00Z"), NOW);
    expect(onBoundary).toBeTruthy();
    expect(onBoundary!.after.end).toBe("2026-11-17");

    const oneDayTooRecent = windowsFor(new Date("2026-10-21T00:00:00Z"), NOW);
    expect(oneDayTooRecent).toBeNull();
  });

  it("reports how long until a change can be judged", () => {
    const days = daysUntilMeasurable(new Date("2026-11-18T00:00:00Z"), NOW);
    expect(days).toBeGreaterThan(25);
    expect(daysUntilMeasurable(new Date("2026-09-01T00:00:00Z"), NOW)).toBe(0);
  });

  it("the outcome says too_early and names the wait, rather than showing a number", () => {
    const o = outcomeFor(fix("2026-11-15T00:00:00Z"), m(10, 500), m(14, 700), NOW);
    expect(o.confidence).toBe("too_early");
    expect(o.summary).toContain("day");
    // Crucially, no percentage. The deltas are still on the object for a
    // caller that wants them, but the sentence must not read as a result.
    expect(o.summary).not.toMatch(/up \d+%/);
  });
});

describe("it refuses to read a percentage off almost no traffic", () => {
  it("3 impressions to 6 is inconclusive, not +100%", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(0, 3), m(0, 6), NOW);
    expect(o.confidence).toBe("thin");
    expect(o.summary).toContain("Too little search traffic");
    expect(o.summary).not.toContain("100%");
  });

  it("still says the change may have been right", () => {
    // Thin data is not evidence against the fix, and implying otherwise
    // would discourage correct work.
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(0, 3), m(0, 6), NOW);
    expect(o.summary).toContain("may still");
  });

  it("a page that crossed the threshold afterwards IS measured", () => {
    // Going from 20 to 900 impressions is exactly the result worth
    // reporting; the thin rule must not swallow it because the BEFORE
    // window was quiet.
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(1, 20), m(30, 900), NOW);
    expect(o.confidence).toBe("measured");
  });
});

describe("it measures without claiming cause", () => {
  it("says measured, not attributed", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(100, 5000), m(140, 6000), NOW);
    expect(o.confidence).toBe("measured");
    expect(o.summary).toContain("Measured, not attributed");
    // The word that would make this a lie.
    expect(o.summary.toLowerCase()).not.toContain("caused");
  });

  it("gives the raw numbers alongside the percentage", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(100, 5000), m(140, 6000), NOW);
    expect(o.summary).toContain("100 → 140");
  });

  it("reports a decline as plainly as a gain", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), m(200, 9000), m(120, 8000), NOW);
    expect(o.summary).toContain("down");
    expect(o.clicksDelta).toBe(-80);
  });

  it("a position of 0 means unknown, not first place", () => {
    // Subtracting a missing position would invent a dramatic improvement
    // out of absent data.
    const o = outcomeFor(
      fix("2026-09-01T00:00:00Z"),
      m(10, 500, 0),
      m(12, 600, 8.2),
      NOW,
    );
    expect(o.positionDelta).toBe(0);
    expect(o.summary).not.toContain("position");
  });

  it("a smaller position number is described as an improvement", () => {
    const o = outcomeFor(
      fix("2026-09-01T00:00:00Z"),
      m(10, 500, 14.0),
      m(20, 700, 8.0),
      NOW,
    );
    expect(o.positionDelta).toBe(-6);
    expect(o.summary).toContain("improved by 6.0");
  });

  it("handles a page with no data at all without throwing", () => {
    const o = outcomeFor(fix("2026-09-01T00:00:00Z"), null, null, NOW);
    expect(o.before.clicks).toBe(0);
    expect(o.confidence).toBe("thin");
  });
});

describe("the rollup is honest about what it is totalling", () => {
  const old = "2026-09-01T00:00:00Z";

  it("only measured changes contribute to the deltas", () => {
    // A handful of noisy or premature rows must not swing the headline.
    const r = rollupOutcomes([
      outcomeFor(fix(old), m(100, 5000), m(150, 6000), NOW),
      outcomeFor(fix("2026-11-18T00:00:00Z"), m(10, 900), m(900, 90000), NOW),
      outcomeFor(fix(old), m(1, 5), m(1, 9), NOW),
    ]);
    expect(r.measured).toBe(1);
    expect(r.tooEarly).toBe(1);
    expect(r.thin).toBe(1);
    expect(r.clicksDelta).toBe(50);
  });

  it("counts wins and losses separately and names both", () => {
    const r = rollupOutcomes([
      outcomeFor(fix(old), m(100, 5000), m(150, 6000), NOW),
      outcomeFor(fix(old), m(100, 5000), m(40, 4000), NOW),
    ]);
    expect(r.improved).toBe(1);
    expect(r.declined).toBe(1);
    expect(r.summary).toContain("1 page gained clicks, 1 lost");
  });

  it("says nothing is measurable yet rather than reporting zero effect", () => {
    // "0 net clicks" and "we cannot tell yet" are completely different
    // claims, and a client reading the first would conclude the work was
    // worthless.
    const r = rollupOutcomes([
      outcomeFor(fix("2026-11-18T00:00:00Z"), m(10, 900), m(11, 950), NOW),
    ]);
    expect(r.measured).toBe(0);
    expect(r.summary).toContain("none measurable yet");
    expect(r.summary).not.toMatch(/net \+?0 clicks/);
  });

  it("says so plainly when nothing has been applied", () => {
    expect(rollupOutcomes([]).summary).toContain("No changes have been applied");
  });

  it("mentions the unmeasurable remainder, so the totals are not mistaken for everything", () => {
    const r = rollupOutcomes([
      outcomeFor(fix(old), m(100, 5000), m(150, 6000), NOW),
      outcomeFor(fix("2026-11-18T00:00:00Z"), m(10, 900), m(11, 950), NOW),
    ]);
    expect(r.summary).toContain("too recent to judge");
  });

  it("repeats the no-attribution caveat in the rollup, not only per page", () => {
    // The rollup is what goes into a client report. If the caveat lives
    // only on the per-page rows, the headline travels without it.
    const r = rollupOutcomes([
      outcomeFor(fix(old), m(100, 5000), m(150, 6000), NOW),
    ]);
    expect(r.summary).toContain("not attributions");
  });
});
