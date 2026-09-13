/**
 * What a blocked search looks like, tested on pages captured live.
 *
 * Every search scraper here reads "zero results" off a page. While this
 * was being written, DuckDuckGo answered every request from the dev
 * machine with a "select the ducks" puzzle — as HTTP 202, which `res.ok`
 * accepts — and Google answered its headless browser with the
 * unusual-traffic page. So at that moment the rank fallback was reporting
 * "not ranking", competitor suggestions "none found", and directory
 * checks "not listed", each with no error.
 *
 * Fixtures in __fixtures__/serp, all captured September 2026 with the
 * machine's IP address and session tokens replaced:
 *
 *   google-sorry-rendered.html  Headless Chromium on a Google search URL
 *   google-sorry-http.html      Plain HTTP GET of google.com/sorry (429)
 *   google-js-required.html     Plain HTTP GET of a search URL (scripts cut)
 *   ddg-challenge.html          html.duckduckgo.com, HTTP 202
 *   ddg-results.html            html.duckduckgo.com, HTTP 200, ten results
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCaptcha, emptyResultsReason } from "./captcha-detect";
import { findProspects, searchDuckDuckGo } from "./link-prospector";
import {
  dedupeResults,
  extractDuckDuckGoHrefs,
  readDuckDuckGoResponse,
  unwrapDuckDuckGoUrl,
} from "./rank-checker";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/serp/${name}`, import.meta.url), "utf8");

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

describe("DuckDuckGo's bot challenge", () => {
  const challenge = fixture("ddg-challenge.html");

  it("is recognised as a block", () => {
    expect(detectCaptcha(challenge)).toEqual({ blocked: true, reason: "ddg_challenge" });
  });

  it("is an error for a rank check, not 'not ranking'", () => {
    const r = readDuckDuckGoResponse(202, challenge, "prateektapes.com");
    expect(r.position).toBeNull();
    expect(r.error).toMatch(/DuckDuckGo/);
  });

  it("parses to nothing, which is how the old path turned it into 'not ranking'", () => {
    // Guards the guard: if this page ever yields hrefs, the test above
    // proves less than it claims.
    expect(extractDuckDuckGoHrefs(challenge)).toEqual([]);
  });
});

describe("a real DuckDuckGo results page", () => {
  const results = fixture("ddg-results.html");
  const ranked = dedupeResults(
    extractDuckDuckGoHrefs(results)
      .map(unwrapDuckDuckGoUrl)
      .filter((h): h is string => h !== null),
  );

  it("is not mistaken for a block", () => {
    expect(detectCaptcha(results).blocked).toBe(false);
    expect(emptyResultsReason("duckduckgo", results)).toBeNull();
  });

  it("reads the position of a domain on the page", () => {
    expect(ranked.length).toBeGreaterThanOrEqual(3);
    const third = hostOf(ranked[2]);
    const firstIndexOfHost = ranked.findIndex((h) => hostOf(h) === third);
    const r = readDuckDuckGoResponse(200, results, third);
    expect(r.error).toBeUndefined();
    expect(r.position).toBe(firstIndexOfHost + 1);
  });

  it("reports a domain that is absent as not ranking, with no error", () => {
    const r = readDuckDuckGoResponse(200, results, "not-on-this-page.example");
    expect(r).toEqual({ position: null, url: null, resultsScanned: ranked.length });
  });

  it("treats a results page with its results removed as genuinely empty", () => {
    // Derived, not captured: an empty page could not be fetched while
    // every request was being challenged. What it checks is that the
    // real page's own frame is what counts as "this is a results page".
    const emptied = results.replace(
      /<a\b[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
      "",
    );
    expect(extractDuckDuckGoHrefs(emptied)).toEqual([]);
    expect(readDuckDuckGoResponse(200, emptied, "x.example")).toEqual({
      position: null,
      url: null,
      resultsScanned: 0,
    });
  });

  it("does not accept a page it does not recognise as empty", () => {
    // HTTP 200, no challenge markers, no results, no search form: some
    // other page. Before, that was "not ranking".
    const r = readDuckDuckGoResponse(200, "<html><body>Service unavailable</body></html>", "x.example");
    expect(r.error).toMatch(/Not recorded as "not ranking"/);
  });

  it("does not accept an HTTP error page as empty", () => {
    expect(readDuckDuckGoResponse(403, "<html>Forbidden</html>", "x.example").error).toMatch(/403/);
  });
});

describe("Google's block pages", () => {
  it("recognises the unusual-traffic page a headless browser is shown", () => {
    expect(detectCaptcha(fixture("google-sorry-rendered.html"))).toEqual({
      blocked: true,
      reason: "google_unusual_traffic",
    });
  });

  it("recognises the same page served to plain HTTP", () => {
    expect(detectCaptcha(fixture("google-sorry-http.html")).blocked).toBe(true);
  });

  it("explains the enable-JavaScript page when it yielded no results", () => {
    expect(emptyResultsReason("google", fixture("google-js-required.html"))).toMatch(/JavaScript/);
  });

  it("does not treat the enable-JavaScript marker alone as a block", () => {
    // The same <noscript> redirect can sit in a normal results page, so
    // blocking on it would fail every working rank check. It only means
    // something once parsing found no results.
    expect(detectCaptcha(fixture("google-js-required.html")).blocked).toBe(false);
  });

  it("accepts Google's own no-results notice as empty", () => {
    const page =
      '<div id="search"><p>Your search - <em>xqzvbnm</em> - did not match any documents.</p></div>';
    expect(emptyResultsReason("google", page)).toBeNull();
  });

  it("calls a page with no results and no notice unreadable", () => {
    expect(emptyResultsReason("google", '<div id="search"></div>')).toMatch(/Not recorded as "not ranking"/);
  });
});

describe("searches that feed competitors, prospects and directory checks", () => {
  afterEach(() => vi.unstubAllGlobals());

  const serve = (body: string, status: number) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status })),
    );

  it("throws on the challenge instead of returning an empty list", async () => {
    serve(fixture("ddg-challenge.html"), 202);
    await expect(searchDuckDuckGo("bopp tape manufacturer")).rejects.toThrow(/DuckDuckGo/);
  });

  it("still returns results from a real page", async () => {
    serve(fixture("ddg-results.html"), 200);
    const rows = await searchDuckDuckGo("bopp tape manufacturer");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("fails the prospect search when every query was blocked", async () => {
    serve(fixture("ddg-challenge.html"), 202);
    await expect(findProspects({ topic: "packaging tape" })).rejects.toThrow(/DuckDuckGo/);
  });
});
