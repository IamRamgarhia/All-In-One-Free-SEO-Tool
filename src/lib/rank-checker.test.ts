import { describe, expect, it } from "vitest";
import {
  dedupeResults,
  extractDuckDuckGoHrefs,
  resultKey,
  unwrapDuckDuckGoUrl,
  GOOGLE_NON_ORGANIC,
} from "./rank-checker";

/**
 * These pin the two bugs that made rank tracking report wrong numbers
 * with no error and no way for a user to tell:
 *
 *   1. DDG's /l/?uddg= redirector meant every result looked like a
 *      duckduckgo.com link, got filtered out, and every DDG check
 *      returned "not ranking". DDG is the fallback whenever Google
 *      blocks the headless browser, so this was the common path.
 *   2. Counting raw anchors instead of results made `index + 1` the
 *      index of the Nth *link*, not the Nth *result* — a genuine #3
 *      could report as #9.
 *
 * Both are silent failures against a live third-party page, which is
 * exactly the class of bug that needs a fixture test: nothing crashes,
 * the number is just wrong.
 */

describe("unwrapDuckDuckGoUrl", () => {
  it("unwraps the /l/?uddg= redirector to the real destination", () => {
    // Verbatim shape from https://duckduckgo.com/html/?q=...
    const href =
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tomsguide.com%2Fbest-picks%2Fcoffee&rut=abc123";
    expect(unwrapDuckDuckGoUrl(href)).toBe(
      "https://www.tomsguide.com/best-picks/coffee",
    );
  });

  it("unwraps when the browser has already resolved the protocol", () => {
    // page.$$eval reads `.href`, which resolves protocol-relative URLs.
    const href =
      "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage";
    expect(unwrapDuckDuckGoUrl(href)).toBe("https://example.com/page");
  });

  it("drops ad slots so they cannot occupy position 1", () => {
    const ad =
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fy.js%3Fad_domain%3Damazon.in";
    expect(unwrapDuckDuckGoUrl(ad)).toBeNull();
  });

  it("returns null for a DDG link with no uddg payload", () => {
    expect(unwrapDuckDuckGoUrl("https://duckduckgo.com/about")).toBeNull();
  });

  it("passes through a direct non-DDG link unchanged", () => {
    expect(unwrapDuckDuckGoUrl("https://example.com/x")).toBe(
      "https://example.com/x",
    );
  });

  it("rejects non-http schemes", () => {
    expect(
      unwrapDuckDuckGoUrl(
        "//duckduckgo.com/l/?uddg=javascript%3Aalert(1)",
      ),
    ).toBeNull();
  });

  it("finds the target domain at the right position in a real result list", () => {
    // Three results; ours is #2. The old code returned null here.
    const hrefs = [
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tomsguide.com%2Fa",
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fb",
      "//duckduckgo.com/l/?uddg=https%3A%2F%2Fseriouseats.com%2Fc",
    ];
    const unwrapped = dedupeResults(
      hrefs.map(unwrapDuckDuckGoUrl).filter((h): h is string => h !== null),
    );
    expect(unwrapped).toHaveLength(3);
    const idx = unwrapped.findIndex((h) => new URL(h).hostname === "example.com");
    expect(idx + 1).toBe(2);
  });
});

describe("extractDuckDuckGoHrefs", () => {
  // Verbatim shape from a live duckduckgo.com/html/ response, including
  // the `&amp;` entity — raw HTML keeps it, the DOM did not. Missing that
  // decode leaves "&amp;rut=..." inside the uddg value and the unwrapped
  // URL comes out wrong.
  const HTML = `
    <div class="result results_links">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.wikipedia.org%2F&amp;rut=ef4d4ea3">Wikipedia</a>
      </h2>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.wikipedia.org%2F&amp;rut=ef4d4ea3">www.wikipedia.org</a>
    </div>
    <div class="result results_links">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fen.wikipedia.org%2Fwiki%2FWikipedia&amp;rut=aa11">Wikipedia - Wikipedia</a>
      </h2>
    </div>`;

  it("takes one href per result, not the display URL too", () => {
    // result__url points at the SAME destination; counting both would
    // halve every reported position.
    expect(extractDuckDuckGoHrefs(HTML)).toHaveLength(2);
  });

  it("decodes &amp; so the uddg payload survives", () => {
    const [first] = extractDuckDuckGoHrefs(HTML);
    expect(first).toContain("&rut=");
    expect(first).not.toContain("&amp;");
    expect(unwrapDuckDuckGoUrl(first)).toBe("https://www.wikipedia.org/");
  });

  it("produces correct positions end to end", () => {
    const results = dedupeResults(
      extractDuckDuckGoHrefs(HTML)
        .map(unwrapDuckDuckGoUrl)
        .filter((h): h is string => h !== null),
    );
    expect(results).toHaveLength(2);
    const pos =
      results.findIndex((h) => new URL(h).hostname === "www.wikipedia.org") + 1;
    expect(pos).toBe(1);
  });

  it("returns nothing for an error page rather than throwing", () => {
    // DDG serves a short 403 body to clients it doesn't like — which is
    // what the headless browser used to get. Parsing it must be inert.
    expect(extractDuckDuckGoHrefs("<html><body>error</body></html>")).toEqual([]);
    expect(extractDuckDuckGoHrefs("")).toEqual([]);
  });
});

describe("resultKey", () => {
  it("ignores scheme, www, query, hash and trailing slash", () => {
    const a = resultKey("https://www.example.com/page/?utm_source=x#frag");
    const b = resultKey("http://example.com/page");
    expect(a).toBe(b);
  });

  it("keeps distinct paths distinct", () => {
    expect(resultKey("https://example.com/a")).not.toBe(
      resultKey("https://example.com/b"),
    );
  });

  it("returns null for a malformed href", () => {
    expect(resultKey("not-a-url")).toBeNull();
  });
});

describe("dedupeResults", () => {
  it("collapses the several anchors Google emits per result", () => {
    // Real shape: title link, then sitelinks, then the same title link
    // again in the "About this result" panel.
    const hrefs = [
      "https://example.com/guide",
      "https://example.com/guide#section-2",
      "https://example.com/guide?ref=sitelink",
      "https://other.com/post",
    ];
    expect(dedupeResults(hrefs)).toEqual([
      "https://example.com/guide",
      "https://other.com/post",
    ]);
  });

  it("preserves SERP order and keeps the first occurrence", () => {
    const hrefs = [
      "https://a.com/1",
      "https://b.com/1",
      "https://a.com/1?dup=1",
      "https://c.com/1",
    ];
    expect(dedupeResults(hrefs)).toEqual([
      "https://a.com/1",
      "https://b.com/1",
      "https://c.com/1",
    ]);
  });

  it("makes position reflect results, not anchors", () => {
    // 8 anchors, 3 results. Target is result #3 — the old anchor-count
    // logic would have reported it at #7.
    const hrefs = [
      "https://first.com/a",
      "https://first.com/a#x",
      "https://first.com/a?b=1",
      "https://second.com/b",
      "https://second.com/b#y",
      "https://target.com/c",
      "https://target.com/c#z",
      "https://target.com/c?q=1",
    ];
    const deduped = dedupeResults(hrefs);
    expect(deduped).toHaveLength(3);
    const pos =
      deduped.findIndex((h) => new URL(h).hostname === "target.com") + 1;
    expect(pos).toBe(3);
  });

  it("drops malformed hrefs rather than counting them as results", () => {
    expect(dedupeResults(["not-a-url", "https://ok.com/x"])).toEqual([
      "https://ok.com/x",
    ]);
  });
});

describe("GOOGLE_NON_ORGANIC", () => {
  it.each([
    "https://www.google.com/search?q=x",
    "https://google.co.uk/imgres",
    "https://accounts.google.com/signin",
    "https://www.googleadservices.com/pagead/aclk",
    "https://webcache.googleusercontent.com/search",
  ])("filters out %s", (href) => {
    expect(GOOGLE_NON_ORGANIC.test(href)).toBe(true);
  });

  it.each([
    "https://example.com/page",
    "https://blog.google.dev.example.com/post",
    "https://notgoogle.com/x",
  ])("keeps organic result %s", (href) => {
    expect(GOOGLE_NON_ORGANIC.test(href)).toBe(false);
  });
});
