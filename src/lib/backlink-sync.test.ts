/**
 * The comparison that decides whether a backlink profile is honest.
 *
 * Every failure here inflates a number a client reads. A normaliser that
 * treats a trailing slash as a different page adds a duplicate of every
 * link on the second sync — so the report says the month earned forty
 * links when it earned none. Nothing errors, and the number is the whole
 * point of the section it appears in.
 *
 * `syncBacklinks` itself talks to the database and to the network, so it
 * is exercised against real data separately; this covers the rule it
 * depends on.
 */

import { describe, expect, it } from "vitest";
import { normaliseUrl, planSync, type KnownLink } from "./backlink-sync";

describe("normaliseUrl", () => {
  it("treats a trailing slash as the same page", () => {
    // The one that would double the profile on every sync.
    expect(normaliseUrl("https://a.com/post")).toBe(
      normaliseUrl("https://a.com/post/"),
    );
  });

  it("ignores case in the host", () => {
    expect(normaliseUrl("https://Example.COM/x")).toBe(
      normaliseUrl("https://example.com/x"),
    );
  });

  it("ignores surrounding whitespace", () => {
    // Links arriving from a CSV paste routinely carry it.
    expect(normaliseUrl("  https://a.com/x  ")).toBe(normaliseUrl("https://a.com/x"));
  });

  it("keeps two genuinely different pages apart", () => {
    expect(normaliseUrl("https://a.com/one")).not.toBe(
      normaliseUrl("https://a.com/two"),
    );
  });

  it("keeps a query string, because two links can differ only there", () => {
    expect(normaliseUrl("https://a.com/p?id=1")).not.toBe(
      normaliseUrl("https://a.com/p?id=2"),
    );
  });

  it("matches the importer's normaliser, so the same link stored twice collapses", () => {
    // A link imported from an Ahrefs CSV and the same link found by
    // discovery must land on one row. The importer lowercases, trims and
    // drops a trailing slash — this asserts the shape agrees rather than
    // reaching into that file.
    const importerForm = (u: string) => u.trim().toLowerCase().replace(/\/$/, "");
    for (const u of [
      "https://Blog.Example.com/post/",
      "  https://a.com/x ",
      "https://a.com/p?id=1",
    ]) {
      expect(normaliseUrl(u)).toBe(importerForm(u));
    }
  });
});

describe("planSync", () => {
  const NOW = new Date("2026-09-09T00:00:00Z");
  const link = (url: string) => ({
    url,
    domain: new URL(url).hostname,
    anchorText: "a link",
    rel: null,
  });
  const plan = (
    links: ReturnType<typeof link>[],
    existing: KnownLink[] = [],
  ) => planSync({ clientId: 1, target: "https://me.com", links, existing, now: NOW });

  it("writes a link it has never seen", () => {
    const p = plan([link("https://blog.com/post")]);
    expect(p.toInsert).toHaveLength(1);
    expect(p.toInsert[0].sourceUrl).toBe("https://blog.com/post");
    expect(p.toInsert[0].source).toBe("discovered");
    expect(p.refreshIds).toEqual([]);
  });

  it("refreshes a link it already holds instead of adding it again", () => {
    // The failure that doubles the profile on the second sync and then
    // never again — a spike nobody can account for.
    const p = plan(
      [link("https://blog.com/post")],
      [{ id: 7, sourceUrl: "https://blog.com/post", status: "active" }],
    );
    expect(p.toInsert).toEqual([]);
    expect(p.refreshIds).toEqual([7]);
  });

  it("matches a known link across a trailing slash", () => {
    const p = plan(
      [link("https://blog.com/post/")],
      [{ id: 7, sourceUrl: "https://blog.com/post", status: "active" }],
    );
    expect(p.toInsert).toEqual([]);
    expect(p.refreshIds).toEqual([7]);
  });

  it("counts a link that came back as recovered, not as new", () => {
    // Reporting a recovery as a new link claims credit for work that was
    // done months ago.
    const p = plan(
      [link("https://blog.com/post")],
      [{ id: 7, sourceUrl: "https://blog.com/post", status: "lost" }],
    );
    expect(p.recoverIds).toEqual([7]);
    expect(p.toInsert).toEqual([]);
    expect(p.refreshIds).toEqual([]);
  });

  it("leaves a disavowed link alone", () => {
    // Somebody decided that link was harmful. A scrape finding it again
    // is not new information about that decision.
    const p = plan(
      [link("https://spam.com/x")],
      [{ id: 9, sourceUrl: "https://spam.com/x", status: "disavow" }],
    );
    expect(p.toInsert).toEqual([]);
    expect(p.refreshIds).toEqual([]);
    expect(p.recoverIds).toEqual([]);
  });

  it("writes one row when both sources return the same page", () => {
    // DuckDuckGo and Common Crawl overlap constantly.
    const p = plan([
      link("https://blog.com/post"),
      link("https://blog.com/post/"),
    ]);
    expect(p.toInsert).toHaveLength(1);
  });

  it("keeps two genuinely different pages on one domain apart", () => {
    const p = plan([link("https://blog.com/a"), link("https://blog.com/b")]);
    expect(p.toInsert).toHaveLength(2);
  });

  it("stamps both timestamps on a new row", () => {
    // firstSeen is what "new links this month" is counted from, so a
    // missing one silently drops the link out of every report.
    const [row] = plan([link("https://blog.com/post")]).toInsert;
    expect(row.firstSeen).toBe(NOW);
    expect(row.lastSeen).toBe(NOW);
  });
});
