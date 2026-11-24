/**
 * The SearXNG response parser.
 *
 * This project's first standing rule: anything that scrapes or parses a
 * third party needs a fixture test, because those responses change
 * without notice and the failure is always silent. SearXNG is the
 * primary rank source on any install without Search Console — the
 * headless-browser fallback is blocked by Google, DuckDuckGo and Bing —
 * so a position this function gets wrong is the number the product is
 * built to report.
 *
 * The fixture below is a real response shape, captured from a SearXNG
 * 2026 container queried for "wordpress seo" on 19 Nov 2026 (upstream
 * 6b4d6f6, ported unchanged apart from the host:port case below).
 */

import { describe, expect, it } from "vitest";
import { normaliseInstanceUrl, parseSearxResults } from "./searxng";

describe("a hostless tracking redirect must not occupy a rank position", () => {
  /*
   * The bug this guards, found by running a real instance rather than
   * reading the code.
   *
   * A live SearXNG returned `http:///go/v1/AeGaCYwI5Bxhav7…` among 52
   * results — a tracking redirect with the host segment missing.
   * `new URL()` does NOT throw on it: it parses `go` as the hostname.
   * So the row survived the try/catch, counted as a result, and pushed
   * every genuine result below it one position down.
   *
   * A rank tracker reporting position 4 for a page at position 3 is the
   * exact failure mode this codebase treats as worse than a crash.
   */
  const body = {
    results: [
      { url: "https://wordpress.org/plugins/wordpress-seo/", engine: "google" },
      { url: "https://wordpress.com/support/seo/", engine: "duckduckgo" },
      { url: "http:///go/v1/AeGaCYwI5Bxhav7LrAHsr1DPB8bGq1szgOBNoU4", engine: "brave" },
      { url: "https://example.com/real-result", engine: "google" },
    ],
  };

  it("drops it", () => {
    const { urls } = parseSearxResults(body);
    expect(urls).not.toContain(
      "http:///go/v1/AeGaCYwI5Bxhav7LrAHsr1DPB8bGq1szgOBNoU4",
    );
  });

  it("so the result below it keeps its true position", () => {
    const { urls } = parseSearxResults(body);
    // Third, not fourth. This is the assertion the whole file exists for.
    expect(urls[2]).toBe("https://example.com/real-result");
    expect(urls.length).toBe(3);
  });

  it("other hostless shapes go too", () => {
    const { urls } = parseSearxResults({
      results: [
        { url: "http:///redirect/abc" },
        { url: "https://localhost/internal" },
        { url: "https://good.example/page" },
      ],
    });
    expect(urls).toEqual(["https://good.example/page"]);
  });
});

describe("ordering and dedupe", () => {
  it("keeps the instance's own order, because its merge is the ranking", () => {
    const { urls } = parseSearxResults({
      results: [
        { url: "https://c.example/" },
        { url: "https://a.example/" },
        { url: "https://b.example/" },
      ],
    });
    expect(urls).toEqual([
      "https://c.example/",
      "https://a.example/",
      "https://b.example/",
    ]);
  });

  it("treats www and a trailing slash as the same page", () => {
    const { urls } = parseSearxResults({
      results: [
        { url: "https://example.com/page" },
        { url: "https://www.example.com/page/" },
      ],
    });
    expect(urls.length).toBe(1);
  });

  it("different paths on one host are different results", () => {
    const { urls } = parseSearxResults({
      results: [
        { url: "https://example.com/a" },
        { url: "https://example.com/b" },
      ],
    });
    expect(urls.length).toBe(2);
  });

  it("collects the engines that answered, sorted and unique", () => {
    const { engines } = parseSearxResults({
      results: [
        { url: "https://a.example/", engines: ["duckduckgo", "brave"] },
        { url: "https://b.example/", engine: "google cse" },
        { url: "https://c.example/", engines: ["brave"] },
      ],
    });
    expect(engines).toEqual(["brave", "duckduckgo", "google cse"]);
  });
});

describe("a malformed body is empty, not an exception", () => {
  it("handles null, a string, and a missing results array", () => {
    // A SearXNG with JSON disabled answers with HTML and a 403. The
    // provider above turns that into a failure, and this must not throw
    // on the way.
    for (const body of [null, undefined, "<html>", 42, {}, { results: null }]) {
      expect(parseSearxResults(body)).toEqual({ urls: [], engines: [] });
    }
  });

  it("skips rows with no url rather than failing the whole response", () => {
    const { urls } = parseSearxResults({
      results: [{ title: "no url here" }, { url: "https://ok.example/" }, { url: 42 }],
    });
    expect(urls).toEqual(["https://ok.example/"]);
  });
});

describe("the instance URL is normalised before use", () => {
  it("adds a scheme and strips a trailing slash", () => {
    expect(normaliseInstanceUrl("searx.example")).toBe("https://searx.example");
    expect(normaliseInstanceUrl("http://searxng:8080/")).toBe("http://searxng:8080");
  });

  it("keeps a sub-path, since an instance can be mounted under one", () => {
    expect(normaliseInstanceUrl("https://example.com/searx/")).toBe(
      "https://example.com/searx",
    );
  });

  it("accepts a bare host:port, which looks like a scheme to a naive test", () => {
    expect(normaliseInstanceUrl("localhost:8888")).toBe("https://localhost:8888");
    expect(normaliseInstanceUrl("searxng:8080/")).toBe("https://searxng:8080");
  });

  it("refuses what is not an http(s) URL", () => {
    for (const bad of ["", "   ", "javascript:alert(1)", "ftp://x.example"]) {
      expect(normaliseInstanceUrl(bad)).toBeNull();
    }
  });
});
