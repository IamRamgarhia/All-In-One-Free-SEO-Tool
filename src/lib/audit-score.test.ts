import { describe, expect, it } from "vitest";
import { scoreFindings, type AuditFinding, type Severity } from "./audit";

function findings(severity: Severity, n: number): AuditFinding[] {
  return Array.from({ length: n }, (_, i) => ({
    type: "missing_meta_description",
    severity,
    url: `https://example.com/page-${i}`,
    message: "test",
  }));
}

/**
 * The property that matters: crawling MORE pages of the SAME quality
 * must not change the health score.
 *
 * The original implementation divided the combined weight by
 * `sqrt(pageCount)`. Per-page findings grow as O(n) and the divisor
 * only as O(sqrt n), so the same site scored progressively worse the
 * deeper you crawled — 25 pages of identical issues took a 5x bigger
 * hit than 1 page. Because crawl size varies run to run (timeouts,
 * settings, site changes), that made scores incomparable between runs
 * and turned the dashboard's health-score trend into a measure of
 * crawl depth rather than SEO health.
 */
describe("scoreFindings", () => {
  it("gives the same score regardless of how many pages were crawled", () => {
    // One 'high' (weight 8) finding per page, no site-wide findings.
    const onePage = scoreFindings(findings("high", 1), 1, 1);
    const tenPages = scoreFindings(findings("high", 10), 10, 10);
    const fiftyPages = scoreFindings(findings("high", 50), 50, 50);

    expect(onePage).toBe(tenPages);
    expect(tenPages).toBe(fiftyPages);
  });

  it("reproduces the old bug's shape to prove it is fixed", () => {
    // Old: totalWeight / sqrt(pages). 25 pages x 8 = 200 / 5 = 40 penalty
    // (score 60) vs 1 page = 8 penalty (score 92). Same site, 32 points apart.
    const oldPenalty = (25 * 8) / Math.sqrt(25);
    expect(Math.round(100 - oldPenalty)).toBe(60);

    // New: averaged per page → identical to the single-page case.
    expect(scoreFindings(findings("high", 25), 25, 25)).toBe(
      scoreFindings(findings("high", 1), 1, 1),
    );
  });

  it("averages per-page findings", () => {
    // 4 pages, but only 2 have the issue → half the per-page penalty.
    const half = scoreFindings(findings("high", 2), 2, 4);
    const all = scoreFindings(findings("high", 4), 4, 4);
    expect(100 - half).toBe((100 - all) / 2);
  });

  it("applies site-wide findings at full weight, not averaged", () => {
    // One site-wide 'high' (8) on a 20-page crawl still costs 8 points —
    // a missing robots.txt is missing once, not 1/20th of a time.
    const siteWide = findings("high", 1);
    expect(scoreFindings(siteWide, 0, 20)).toBe(92);
    expect(scoreFindings(siteWide, 0, 1)).toBe(92);
  });

  it("combines per-page and site-wide penalties", () => {
    // 10 pages x 'medium' (3) averaged = 3, plus one site-wide
    // 'critical' (25) at full weight = 28 total.
    const all = [...findings("medium", 10), ...findings("critical", 1)];
    expect(scoreFindings(all, 10, 10)).toBe(72);
  });

  it("returns 100 for a clean crawl", () => {
    expect(scoreFindings([], 0, 12)).toBe(100);
  });

  it("clamps to 0 rather than going negative", () => {
    expect(scoreFindings(findings("critical", 40), 0, 1)).toBe(0);
  });

  it("treats a zero page count as one page instead of dividing by zero", () => {
    expect(Number.isFinite(scoreFindings(findings("high", 1), 1, 0))).toBe(true);
  });

  it("weights severities in the documented order", () => {
    const score = (s: Severity) => scoreFindings(findings(s, 1), 1, 1);
    expect(score("critical")).toBeLessThan(score("high"));
    expect(score("high")).toBeLessThan(score("medium"));
    expect(score("medium")).toBeLessThan(score("low"));
  });
});
