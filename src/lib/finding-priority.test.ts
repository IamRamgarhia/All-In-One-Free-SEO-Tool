/**
 * Traffic-weighted prioritisation.
 *
 * Two properties carry the whole feature, and both are about honesty
 * rather than arithmetic:
 *
 *   1. With no Search Console data the result says `severity_only`. On
 *      the maintainer's own install every client 403s, so this is the
 *      COMMON path, not an edge case — and a severity list presented as
 *      "prioritised by impact" is a lie a user cannot detect.
 *
 *   2. A finding that suppresses its own page's traffic is never
 *      demoted for having none. A noindexed page has no impressions
 *      BECAUSE it is noindexed; multiplying its importance by its
 *      traffic buries the most expensive problems on the site. That
 *      circularity is the specific way naive traffic weighting is worse
 *      than no weighting.
 */

import { describe, expect, it } from "vitest";
import {
  buildPerfIndex,
  describeBasis,
  prioritiseFindings,
  type PagePerf,
} from "./finding-priority";

type F = { url: string | null; type: string; severity: string };
const get = (f: F) => f;

const perf: PagePerf[] = [
  { page: "https://example.com/busy", clicks: 500, impressions: 20_000, position: 8.4 },
  { page: "https://example.com/quiet", clicks: 1, impressions: 12, position: 42.1 },
];

describe("no traffic data must not look like prioritisation", () => {
  it("reports severity_only when perf is null", () => {
    const r = prioritiseFindings(
      [{ url: "https://example.com/a", type: "long_title", severity: "medium" }],
      get,
      null,
    );
    expect(r.basis).toBe("severity_only");
    expect(r.matched).toBe(0);
  });

  it("reports severity_only when perf is empty, not 'traffic' with zeroes", () => {
    // The dangerous case: an API that returned [] because it 403'd looks
    // exactly like a site with no traffic. Treating it as data would
    // rank every page as equally worthless and call it impact ordering.
    const r = prioritiseFindings(
      [{ url: "https://example.com/a", type: "long_title", severity: "medium" }],
      get,
      [],
    );
    expect(r.basis).toBe("severity_only");
  });

  it("says so in words, and offers the fix", () => {
    const r = prioritiseFindings([], get, null);
    expect(describeBasis(r)).toContain("Ordered by severity");
    expect(describeBasis(r)).toContain("Connect Search Console");
  });

  it("every reason names the basis, so a row read alone is not misleading", () => {
    const r = prioritiseFindings(
      [{ url: "https://example.com/a", type: "long_title", severity: "high" }],
      get,
      null,
    );
    expect(r.items[0].reason).toContain("No Search Console data");
    expect(r.items[0].impressions).toBeNull();
  });

  it("with data, impressions are a number rather than null", () => {
    const r = prioritiseFindings(
      [{ url: "https://example.com/busy", type: "long_title", severity: "medium" }],
      get,
      perf,
    );
    expect(r.basis).toBe("traffic");
    expect(r.items[0].impressions).toBe(20_000);
    expect(describeBasis(r)).toContain("1 of 1");
  });
});

describe("traffic changes the order, which is the point", () => {
  it("a low-severity issue on a busy page can outrank a medium one on a quiet page", () => {
    const items: F[] = [
      { url: "https://example.com/quiet", type: "long_title", severity: "medium" },
      { url: "https://example.com/busy", type: "missing_og_tags", severity: "low" },
    ];
    const r = prioritiseFindings(items, get, perf);
    expect(r.items[0].item.url).toBe("https://example.com/busy");
  });

  it("without traffic data that same pair sorts by severity instead", () => {
    const items: F[] = [
      { url: "https://example.com/quiet", type: "long_title", severity: "medium" },
      { url: "https://example.com/busy", type: "missing_og_tags", severity: "low" },
    ];
    const r = prioritiseFindings(items, get, null);
    expect(r.items[0].item.url).toBe("https://example.com/quiet");
  });

  it("severity still dominates between pages with similar traffic", () => {
    const same: PagePerf[] = [
      { page: "https://example.com/a", clicks: 10, impressions: 1000, position: 10 },
      { page: "https://example.com/b", clicks: 10, impressions: 1000, position: 10 },
    ];
    const r = prioritiseFindings(
      [
        { url: "https://example.com/a", type: "missing_og_tags", severity: "low" },
        { url: "https://example.com/b", type: "missing_title", severity: "critical" },
      ],
      get,
      same,
    );
    expect(r.items[0].item.severity).toBe("critical");
  });

  it("one enormous page cannot drown out the rest of the site", () => {
    // Linear weighting would make a single 1,000,000-impression page's
    // trivial issue outrank a critical problem anywhere else. The log
    // keeps the list usable.
    const huge: PagePerf[] = [
      { page: "https://example.com/huge", clicks: 1, impressions: 1_000_000, position: 5 },
      { page: "https://example.com/small", clicks: 1, impressions: 50, position: 5 },
    ];
    const r = prioritiseFindings(
      [
        { url: "https://example.com/huge", type: "missing_twitter_card", severity: "low" },
        { url: "https://example.com/small", type: "missing_title", severity: "critical" },
      ],
      get,
      huge,
    );
    expect(r.items[0].item.severity).toBe("critical");
  });
});

describe("findings that suppress their own traffic are not demoted for it", () => {
  it("a noindexed page with zero impressions outranks a cosmetic issue on a busy one", () => {
    // The circular-reasoning trap. /blocked has no traffic BECAUSE it is
    // noindexed, so weighting it down by its traffic hides the most
    // expensive finding on the site.
    const r = prioritiseFindings(
      [
        { url: "https://example.com/busy", type: "missing_twitter_card", severity: "low" },
        { url: "https://example.com/blocked", type: "noindex_set", severity: "critical" },
      ],
      get,
      perf,
    );
    expect(r.items[0].item.type).toBe("noindex_set");
  });

  it("and the reason explains why low traffic is not a reason to skip it", () => {
    const r = prioritiseFindings(
      [{ url: "https://example.com/blocked", type: "blocked_by_robots", severity: "critical" }],
      get,
      perf,
    );
    expect(r.items[0].reason).toContain("reason to fix it, not to skip it");
  });

  it("covers the suppressing types that actually exist", () => {
    // Guards against a typo'd type name silently falling through to the
    // demoting branch — the same class of bug as close-loop's invented
    // finding types, which made its central check a no-op.
    for (const type of [
      "noindex_set",
      "blocked_by_robots",
      "bad_status",
      "soft_404",
      "orphan_pages",
    ]) {
      const r = prioritiseFindings(
        [{ url: "https://example.com/nowhere", type, severity: "high" }],
        get,
        perf,
      );
      expect(r.items[0].reason, `${type} was demoted for having no traffic`).toContain(
        "reason to fix it",
      );
    }
  });
});

describe("URL matching survives the shapes Search Console reports", () => {
  it("matches across scheme, www and trailing slash", () => {
    const rows: PagePerf[] = [
      { page: "https://www.example.com/page/", clicks: 5, impressions: 900, position: 9 },
    ];
    const r = prioritiseFindings(
      [{ url: "http://example.com/page", type: "long_title", severity: "medium" }],
      get,
      rows,
    );
    expect(r.matched).toBe(1);
    expect(r.items[0].impressions).toBe(900);
  });

  it("keeps the busier row when a page is reported twice", () => {
    // A domain property and a URL-prefix property can both report the
    // same page. Taking whichever came last would make the ordering
    // depend on API row order.
    const idx = buildPerfIndex([
      { page: "https://example.com/x", clicks: 1, impressions: 10, position: 30 },
      { page: "https://example.com/x", clicks: 9, impressions: 900, position: 9 },
    ]);
    expect(idx.get("example.com/x")?.impressions).toBe(900);
  });

  it("a finding with no URL is still ranked, not dropped", () => {
    // Site-wide findings (missing sitemap, robots.txt) have no page.
    // Dropping them would silently shrink the list.
    const r = prioritiseFindings(
      [{ url: null, type: "missing_sitemap", severity: "high" }],
      get,
      perf,
    );
    expect(r.items.length).toBe(1);
  });

  it("an unknown severity is treated as medium rather than zero", () => {
    const r = prioritiseFindings(
      [{ url: "https://example.com/busy", type: "long_title", severity: "wat" }],
      get,
      perf,
    );
    expect(r.items[0].score).toBeGreaterThan(0);
  });
});

describe("in French (added in this fork)", () => {
  it("says it is severity order when there is no Search Console data", () => {
    const r = prioritiseFindings([{ url: "https://e.com/a", type: "long_title", severity: "high" }], (x) => x, null, "fr");
    expect(describeBasis(r, "fr")).toContain("Classé par gravité");
    expect(r.items[0].reason).toContain("Aucune donnée Search Console");
  });

  it("names the measured impressions in French typography", () => {
    const r = prioritiseFindings(
      [{ url: "https://e.com/a", type: "long_title", severity: "high" }],
      (x) => x,
      [{ page: "https://e.com/a", clicks: 3, impressions: 1234, position: 7.25 }],
      "fr",
    );
    expect(r.items[0].reason).toMatch(/1\s234 impressions/);
    expect(r.items[0].reason).toContain("7,3");
    expect(describeBasis(r, "fr")).toContain("1 constat sur 1");
  });
});
