import { describe, expect, it } from "vitest";
import { __bingParsing } from "./bing-webmaster";

const { pick, unwrap } = __bingParsing;

/**
 * CLAUDE.md's first standing rule: anything that reads a third party
 * needs a fixture test, because those responses change without notice
 * and the failure is always silent.
 *
 * Bing is a textbook case. The API returns its payload under `d`,
 * sometimes as a bare array and sometimes wrapped in an object, and
 * field casing has moved between releases. Every one of those variations
 * produces zero backlinks rather than an error — the import would report
 * "0 new backlinks" and the user would conclude their site has none.
 *
 * These are fixtures of the shapes the endpoints are documented to
 * return, plus the variants defensive parsing exists for. They do NOT
 * prove our reading matches the live API — no Bing key is configured on
 * this instance, so the live shapes are unverified.
 */

describe("unwrap — payload arrives in several shapes", () => {
  it("takes a bare array", () => {
    expect(unwrap([{ Url: "a" }, { Url: "b" }])).toHaveLength(2);
  });

  it("takes an object wrapping Links", () => {
    expect(unwrap({ Links: [{ Url: "a" }], TotalPages: 3 })).toHaveLength(1);
  });

  it("takes lowercase wrappers too", () => {
    expect(unwrap({ links: [{ url: "a" }] })).toHaveLength(1);
    expect(unwrap({ Results: [{ Url: "a" }] })).toHaveLength(1);
  });

  it("returns empty rather than throwing on null or junk", () => {
    // Bing returns `d: null` for an empty result set. Throwing here
    // would turn "no links yet" into a broken feature.
    for (const bad of [null, undefined, 0, "", { d: 1 }, { Links: "nope" }]) {
      expect(unwrap(bad), JSON.stringify(bad)).toEqual([]);
    }
  });
});

describe("pick — field casing has moved between API versions", () => {
  it("finds the exact name first", () => {
    expect(pick({ Url: "x", url: "y" }, "Url")).toBe("x");
  });

  it("falls back to an alias", () => {
    expect(pick({ TargetUrl: "x" }, "Url", "url", "TargetUrl")).toBe("x");
  });

  it("matches case-insensitively as a last resort", () => {
    // The variation that would silently zero out an import: a rename
    // from AnchorText to anchortext returns undefined from a strict
    // read, and every link imports with no anchor.
    expect(pick({ ANCHORTEXT: "buy shoes" }, "AnchorText")).toBe("buy shoes");
  });

  it("skips null and undefined rather than returning them", () => {
    expect(pick({ Url: null, TargetUrl: "x" }, "Url", "TargetUrl")).toBe("x");
    expect(pick({ Url: undefined, url: "y" }, "Url")).toBe("y");
  });

  it("returns undefined when nothing matches", () => {
    expect(pick({ Foo: 1 }, "Url")).toBeUndefined();
  });

  it("does not treat 0 or empty string as missing", () => {
    // A page with zero inbound links is a real answer. Coercing it to
    // "missing" and falling through to an alias would report the wrong
    // count.
    expect(pick({ Count: 0 }, "Count")).toBe(0);
    expect(pick({ AnchorText: "" }, "AnchorText")).toBe("");
  });
});

/**
 * End-to-end over the parsing, using the response shapes the endpoints
 * are documented to return. Reproduces what `getBingLinkCounts` and
 * `getBingInboundLinks` do to a payload without going near the network.
 */
describe("realistic payloads", () => {
  const parseCounts = (d: unknown) =>
    unwrap(d)
      .map((row) => {
        const r = row as Record<string, unknown>;
        const url = pick(r, "Url", "url", "TargetUrl");
        const count = pick(r, "Count", "count", "LinkCount");
        return {
          url: typeof url === "string" ? url : "",
          count: Number(count) || 0,
        };
      })
      .filter((r) => r.url.length > 0);

  it("reads GetLinkCounts in its documented shape", () => {
    const rows = parseCounts([
      { __type: "LinkCount", Url: "https://example.com/", Count: 412 },
      { __type: "LinkCount", Url: "https://example.com/blog", Count: 37 },
    ]);
    expect(rows).toEqual([
      { url: "https://example.com/", count: 412 },
      { url: "https://example.com/blog", count: 37 },
    ]);
  });

  it("still reads it if Bing wraps the array", () => {
    const rows = parseCounts({
      Links: [{ Url: "https://example.com/", Count: 5 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(5);
  });

  it("drops rows with no URL instead of importing blanks", () => {
    // A blank sourceUrl would create a backlink row pointing nowhere,
    // which then shows up in a client report as a link.
    const rows = parseCounts([
      { Url: "", Count: 9 },
      { Count: 3 },
      { Url: "https://example.com/ok", Count: 1 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe("https://example.com/ok");
  });

  it("treats a non-numeric count as zero rather than NaN", () => {
    // NaN would propagate into the sort that decides which pages to
    // fetch details for, and the ordering would silently scramble.
    const rows = parseCounts([{ Url: "https://a.test/", Count: "many" }]);
    expect(rows[0].count).toBe(0);
  });
});
