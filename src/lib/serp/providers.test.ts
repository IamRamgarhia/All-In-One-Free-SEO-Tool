import { describe, expect, it } from "vitest";
import { positionOf, urlMatchesDomain } from "./match";
import { createSearxngProvider, normaliseInstanceUrl, parseSearxResults } from "./searxng";
import { createBraveProvider, parseBraveResults } from "./brave";

/**
 * Two keyless rank sources that sit between Search Console and the
 * browser scraper.
 *
 * Both parse a third party's response, so both need fixture tests —
 * standing rule 1. The failure mode they guard is the one this codebase
 * keeps rediscovering: a source that stops returning results, and a
 * caller that records "not ranking" instead of "we got no answer".
 *
 * The fixtures are written from each API's documented shape, not
 * captured from a live call, and say so. Public SearXNG instances all
 * disable `format=json`, so there was nothing live to capture from.
 */

const json = (body: unknown, init: Partial<{ status: number; text: string }> = {}) =>
  Promise.resolve({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    text: () => Promise.resolve(init.text ?? JSON.stringify(body)),
  } as Response);

describe("urlMatchesDomain", () => {
  it("matches the domain and its subdomains", () => {
    expect(urlMatchesDomain("https://example.com/a", "example.com")).toBe(true);
    expect(urlMatchesDomain("https://www.example.com/a", "example.com")).toBe(true);
    expect(urlMatchesDomain("https://blog.example.com/a", "example.com")).toBe(true);
    // The caller may hand us the domain with www on it.
    expect(urlMatchesDomain("https://example.com/a", "www.example.com")).toBe(true);
  });

  it("does not match a lookalike", () => {
    // `includes()` would say yes to all of these.
    expect(urlMatchesDomain("https://notexample.com/a", "example.com")).toBe(false);
    expect(urlMatchesDomain("https://example.com.evil.net/a", "example.com")).toBe(false);
    expect(urlMatchesDomain("https://myexample.com/a", "example.com")).toBe(false);
  });

  it("is not fooled by junk", () => {
    expect(urlMatchesDomain("not a url", "example.com")).toBe(false);
    expect(urlMatchesDomain("https://example.com", "")).toBe(false);
  });
});

describe("positionOf", () => {
  it("is 1-indexed and returns the first match", () => {
    const urls = ["https://a.com/1", "https://example.com/x", "https://example.com/y"];
    expect(positionOf(urls, "example.com")).toEqual({
      position: 2,
      url: "https://example.com/x",
    });
  });

  it("returns null when absent", () => {
    expect(positionOf(["https://a.com/1"], "example.com")).toBeNull();
    expect(positionOf([], "example.com")).toBeNull();
  });
});

describe("normaliseInstanceUrl", () => {
  it.each([
    ["https://searx.example.com", "https://searx.example.com"],
    ["https://searx.example.com/", "https://searx.example.com"],
    ["searx.example.com", "https://searx.example.com"],
    ["  https://searx.example.com//  ", "https://searx.example.com"],
    ["http://localhost:8888", "http://localhost:8888"],
    ["https://host.tld/searxng/", "https://host.tld/searxng"],
  ])("%s -> %s", (input, expected) => {
    expect(normaliseInstanceUrl(input)).toBe(expected);
  });

  it("rejects what isn't a URL", () => {
    expect(normaliseInstanceUrl("")).toBeNull();
    expect(normaliseInstanceUrl("   ")).toBeNull();
    expect(normaliseInstanceUrl("javascript:alert(1)")).toBeNull();
  });
});

/** Shape per SearXNG's documented JSON output. */
const SEARX_BODY = {
  query: "best running shoes",
  number_of_results: 0,
  results: [
    { url: "https://runnersworld.com/shoes", title: "Best shoes", engines: ["google", "brave"] },
    { url: "https://example.com/running", title: "Ours", engines: ["google"] },
    // Same page, different query string — one result, not two.
    { url: "https://runnersworld.com/shoes?utm=x", title: "dupe", engines: ["bing"] },
    { url: "https://nike.com/running", title: "Nike", engine: "bing" },
  ],
};

describe("parseSearxResults", () => {
  it("keeps order, dedupes the same page, and collects engines", () => {
    const { urls, engines } = parseSearxResults(SEARX_BODY);
    expect(urls).toEqual([
      "https://runnersworld.com/shoes",
      "https://example.com/running",
      "https://nike.com/running",
    ]);
    expect(engines).toEqual(["bing", "brave", "google"]);
  });

  it("survives a shape it does not recognise", () => {
    for (const junk of [null, undefined, {}, { results: "nope" }, { results: [null, 5] }]) {
      expect(parseSearxResults(junk)).toEqual({ urls: [], engines: [] });
    }
  });
});

describe("searxng provider", () => {
  const provider = (fetchImpl: typeof fetch, url = "https://searx.example.com") =>
    createSearxngProvider({ instanceUrl: url, fetchImpl });

  it("finds the position and reports which engines answered", async () => {
    const p = provider((() => json(SEARX_BODY)) as unknown as typeof fetch);
    const r = await p.lookup({ query: "best running shoes", domain: "example.com" });
    expect(r).toMatchObject({ ok: true, position: 2, resultsScanned: 3 });
    if (r.ok) expect(r.detail).toContain("google");
  });

  it("reports a genuine miss as position null, still ok", async () => {
    // We got a full answer; the domain is not in it. That IS a result.
    const p = provider((() => json(SEARX_BODY)) as unknown as typeof fetch);
    const r = await p.lookup({ query: "x", domain: "absent.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.position).toBeNull();
  });

  it("names the fix when JSON is disabled", async () => {
    // The overwhelmingly common misconfiguration: format=json is off by
    // default, so the instance serves the HTML page instead.
    const p = provider(
      (() => json(null, { text: "<!doctype html><html>…" })) as unknown as typeof fetch,
    );
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("settings.yml");
      expect(r.error).toContain("json");
    }
  });

  it("distinguishes rate limiting from every other failure", async () => {
    const p = provider((() => json({}, { status: 429 })) as unknown as typeof fetch);
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/rate-limited/i);
  });

  it("treats zero results as no answer, not as not-ranking", async () => {
    // Every engine blocked is a failure to measure. Recording it as
    // "not ranking" writes a drop into history that never happened.
    const p = provider((() => json({ results: [] })) as unknown as typeof fetch);
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r.ok).toBe(false);
  });

  it("refuses an unusable instance URL without calling out", async () => {
    let called = false;
    const p = provider(
      ((..._a: unknown[]) => {
        called = true;
        return json({});
      }) as unknown as typeof fetch,
      "",
    );
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });
});

/** Shape per Brave's documented web-search response. */
const BRAVE_BODY = {
  web: {
    results: [
      { url: "https://runnersworld.com/shoes", title: "Best" },
      { url: "https://example.com/running", title: "Ours" },
      { url: "https://runnersworld.com/shoes/", title: "dupe" },
    ],
  },
};

describe("brave provider", () => {
  const provider = (fetchImpl: typeof fetch, apiKey = "k") =>
    createBraveProvider({ apiKey, fetchImpl });

  it("parses, dedupes and positions", () => {
    expect(parseBraveResults(BRAVE_BODY)).toEqual([
      "https://runnersworld.com/shoes",
      "https://example.com/running",
    ]);
  });

  it("survives an unrecognised shape", () => {
    for (const junk of [null, {}, { web: {} }, { web: { results: 7 } }]) {
      expect(parseBraveResults(junk)).toEqual([]);
    }
  });

  it("says the result came from Brave's own index", async () => {
    // Not a Google stand-in. A page can be #3 on Brave and #30 on
    // Google, so the provenance has to travel with the number.
    const p = provider((() => json(BRAVE_BODY)) as unknown as typeof fetch);
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r).toMatchObject({ ok: true, position: 2 });
    if (r.ok) expect(r.detail).toMatch(/Brave's own index/);
  });

  it("separates a bad key from a rate limit from everything else", async () => {
    const cases: [number, RegExp][] = [
      [401, /rejected the API key/i],
      [403, /rejected the API key/i],
      [429, /rate-limited/i],
      [500, /HTTP 500/],
    ];
    for (const [status, expected] of cases) {
      const p = provider((() => json({}, { status })) as unknown as typeof fetch);
      const r = await p.lookup({ query: "x", domain: "example.com" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(expected);
    }
  });

  it("will not call out with no key", async () => {
    let called = false;
    const p = provider(
      ((..._a: unknown[]) => {
        called = true;
        return json({});
      }) as unknown as typeof fetch,
      "   ",
    );
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("treats an empty web section as no answer", async () => {
    const p = provider((() => json({ web: { results: [] } })) as unknown as typeof fetch);
    const r = await p.lookup({ query: "x", domain: "example.com" });
    expect(r.ok).toBe(false);
  });
});
