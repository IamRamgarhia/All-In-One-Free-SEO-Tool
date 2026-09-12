/**
 * The fix set an edge worker serves to a live website.
 *
 * This is the highest-consequence data in the app: it is applied to
 * every page view, in front of the origin, for anyone visiting the
 * site. The two failures that matter are both silent.
 *
 * A reverted fix that keeps being served means undo appears to work in
 * the app while the edge serves the old value forever. And the wrong
 * value winning for a page means a title somebody replaced twice shows
 * whichever row the database happened to return first — correct-looking
 * on every screen, wrong on the actual website.
 */

import { describe, expect, it } from "vitest";
import { buildFixSet, isLiveFix, pathOf } from "./edge-fixes";

const row = (over: Partial<Parameters<typeof buildFixSet>[0][number]> = {}) => ({
  id: 1,
  kind: "write_title",
  targetUrl: "https://example.com/about",
  afterValue: "A better title",
  ...over,
});

describe("which actions are still fixes", () => {
  it("serves applied and verified", () => {
    // "verified" is the executor's own promotion once it has read the
    // change back off the live page. Filtering to "applied" alone would
    // drop exactly the fixes confirmed to work.
    expect(isLiveFix({ kind: "write_title", status: "applied" })).toBe(true);
    expect(isLiveFix({ kind: "write_title", status: "verified" })).toBe(true);
  });

  it("stops serving a reverted fix", () => {
    // The one that matters most. Undo has to reach the edge, or it only
    // appears to have worked.
    expect(isLiveFix({ kind: "write_title", status: "reverted" })).toBe(false);
  });

  it("never serves a queued, failed or skipped action", () => {
    // Queued is the dangerous one: the value exists and nobody approved
    // it. Serving that would apply changes the user explicitly did not.
    for (const status of ["queued", "failed", "skipped", "pending"]) {
      expect(isLiveFix({ kind: "write_title", status }), status).toBe(false);
    }
  });

  it("ignores kinds the worker cannot rewrite", () => {
    // Schema, alt text and internal links edit the body of a document.
    // An edge worker rewriting article content is a far larger blast
    // radius than a head tag, so they are deliberately excluded.
    for (const kind of ["write_schema", "write_image_alt", "write_internal_links"]) {
      expect(isLiveFix({ kind, status: "applied" }), kind).toBe(false);
    }
  });
});

describe("matching a URL to a request path", () => {
  it("reduces an absolute URL to path and query", () => {
    expect(pathOf("https://example.com/about?x=1")).toBe("/about?x=1");
  });

  it("keeps a trailing slash rather than guessing", () => {
    // "/blog" and "/blog/" can be genuinely different pages. Treating
    // them as the same is how a fix lands on the wrong one.
    expect(pathOf("https://example.com/blog/")).toBe("/blog/");
    expect(pathOf("https://example.com/blog")).toBe("/blog");
  });

  it("passes through something already a path", () => {
    expect(pathOf("/about")).toBe("/about");
  });

  it("refuses anything it cannot turn into a match key", () => {
    // Null means "no fix for this", which is the safe answer. A bare
    // string used as a key would never match and would sit in the feed
    // looking like a fix that works.
    expect(pathOf("about")).toBeNull();
    expect(pathOf("")).toBeNull();
  });
});

describe("building the set", () => {
  it("puts each fix under its page path", () => {
    const set = buildFixSet([row()]);
    expect(set.pages["/about"]).toEqual({ title: "A better title" });
    expect(set.count).toBe(1);
  });

  it("lets the newest action win for the same page and field", () => {
    // A title fixed twice must serve the second one. Without ordering
    // this depends on row order, which is correct-looking everywhere
    // and wrong on the website.
    const set = buildFixSet([
      row({ id: 1, afterValue: "Old title" }),
      row({ id: 9, afterValue: "New title" }),
    ]);
    expect(set.pages["/about"].title).toBe("New title");
  });

  it("keeps different fields on the same page side by side", () => {
    const set = buildFixSet([
      row({ id: 1, kind: "write_title", afterValue: "T" }),
      row({ id: 2, kind: "write_meta_description", afterValue: "D" }),
      row({ id: 3, kind: "write_canonical", afterValue: "https://example.com/about" }),
    ]);
    expect(set.pages["/about"]).toEqual({
      title: "T",
      meta_description: "D",
      canonical: "https://example.com/about",
    });
  });

  it("writes twitter:title alongside og:title from one action", () => {
    // The agent writes both together, so the worker gets both from the
    // one action rather than needing a second kind carrying the same
    // string.
    const set = buildFixSet([row({ kind: "write_social_meta", afterValue: "Share me" })]);
    expect(set.pages["/about"]).toEqual({
      og_title: "Share me",
      twitter_title: "Share me",
    });
  });

  it("drops actions with nothing to apply", () => {
    // A null afterValue on the wire would become the string "null" in
    // somebody's title tag.
    const set = buildFixSet([
      row({ id: 1, afterValue: null }),
      row({ id: 2, targetUrl: null }),
    ]);
    expect(set.pages).toEqual({});
    expect(set.count).toBe(0);
  });

  it("keeps pages apart", () => {
    const set = buildFixSet([
      row({ id: 1, targetUrl: "https://example.com/a", afterValue: "A" }),
      row({ id: 2, targetUrl: "https://example.com/b", afterValue: "B" }),
    ]);
    expect(set.pages["/a"].title).toBe("A");
    expect(set.pages["/b"].title).toBe("B");
  });

  it("returns an empty set rather than throwing on no input", () => {
    const set = buildFixSet([]);
    expect(set.pages).toEqual({});
    expect(set.count).toBe(0);
    expect(set.generatedAt).toBeTruthy();
  });
});
