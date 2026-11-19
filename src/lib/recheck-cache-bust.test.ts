/**
 * A re-check must not be answered by a CDN's copy of the old page.
 *
 * MEASURED 19 Nov 2026 against a live WordPress site behind Hostinger's
 * CDN: a write that had landed perfectly read back as unchanged, over
 * and over, because the CDN served HTML from before the write. The
 * script doing the reading passed `cache: "no-store"`, which instructs
 * the CLIENT and says nothing to the network in front of the site.
 *
 * `recheckUrl` is what decides whether an applied fix is real — it
 * re-fetches the page and only marks a finding resolved once the live
 * HTML agrees. Without cache-busting, the common case on a cached site
 * is: the fix works, the re-check sees the old page, the finding stays
 * open, and the user is told their change did not take. Conservative,
 * and wrong, and on most WordPress sites.
 *
 * The two things that could go wrong with the cure are what this file
 * mostly covers, because both would INVENT a finding:
 *
 *   - a site that 4xxs on an unknown query parameter, whose bad_status
 *     would read as "the fix did not work"
 *   - `finalUrl` left as the busted URL, which the canonical check
 *     compares against, producing a mismatch on every re-check
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECHECK_BUST_PARAM, stripRecheckParam } from "./audit";

describe("the re-check cache-busting parameter", () => {
  it("has a name that will not collide with a real one", () => {
    // Shared with stripRecheckParam, so the two cannot disagree about
    // which parameter to remove — a mismatch would leave it on
    // finalUrl and break canonical checks silently.
    expect(RECHECK_BUST_PARAM).toBe("_seorecheck");
    expect(RECHECK_BUST_PARAM.startsWith("_")).toBe(true);
  });

  it("is removed from a URL that has only it", () => {
    expect(stripRecheckParam(`https://x.test/page?${RECHECK_BUST_PARAM}=abc`)).toBe(
      "https://x.test/page",
    );
    // No trailing "?" left behind: a canonical comparison is a string
    // comparison, and "https://x.test/page?" is not the same string.
    expect(
      stripRecheckParam(`https://x.test/page?${RECHECK_BUST_PARAM}=abc`),
    ).not.toContain("?");
  });

  it("keeps the site's OWN query parameters", () => {
    // A paginated or filtered URL is a real page, and dropping its
    // parameters would re-check a different page than the one the
    // finding is about.
    const out = stripRecheckParam(
      `https://x.test/shop?page=2&${RECHECK_BUST_PARAM}=abc&sort=price`,
    );
    expect(out).toContain("page=2");
    expect(out).toContain("sort=price");
    expect(out).not.toContain(RECHECK_BUST_PARAM);
  });

  it("leaves a URL that never had it completely alone", () => {
    for (const u of [
      "https://x.test/",
      "https://x.test/a/b?c=d",
      "https://x.test/page#anchor",
    ]) {
      expect(stripRecheckParam(u)).toBe(u);
    }
  });

  it("does not throw on something that is not a URL", () => {
    // recheckUrl is handed whatever is stored on the finding, and a
    // malformed value should not take the verification path down with
    // it — the caller has its own "could not fetch" branch for that.
    expect(stripRecheckParam("not a url")).toBe("not a url");
    expect(stripRecheckParam("")).toBe("");
  });
});

describe("the re-check fetch falls back", () => {
  it("documents the fallback in the function it belongs to", () => {
    // The behaviour needs a live server to exercise properly, and the
    // fixture crawl in audit.test.ts covers the normal path. What is
    // asserted here is that the fallback was not quietly dropped: a
    // site that 4xxs on an unknown parameter must be retried plain,
    // because otherwise the cure invents a bad_status finding that
    // reads as "your fix did not work".
    const src = readFileSync(
      join(process.cwd(), "src/lib/audit.ts"),
      "utf8",
    );
    const fn = src.slice(
      src.indexOf("async function fetchRecheckPage"),
      src.indexOf("Re-run the per-page checks on ONE live URL"),
    );
    expect(fn.length).toBeGreaterThan(200);
    expect(fn, "no plain-URL retry").toMatch(/status >= 400[\s\S]{0,400}fetchPage\(url/);
    expect(fn, "finalUrl is not put back").toContain("stripRecheckParam(page.finalUrl)");
  });
});

