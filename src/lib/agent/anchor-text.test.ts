import { describe, expect, it } from "vitest";
import { pickAnchor, visibleText } from "./anchor-text";

/**
 * The anchor picker decides what text on a live article becomes a link.
 *
 * Two failure modes matter, and both are silent:
 *
 *   Proposing a phrase that isn't on the page. The CMS refuses it, the
 *   run reports "anchor not found", and the user sees the agent trying
 *   and failing repeatedly for no visible reason.
 *
 *   Proposing a phrase that IS on the page but shouldn't be linked —
 *   inside an existing link, a heading, a code sample, or halfway
 *   through a longer word. The plugin guards most of this, but an
 *   anchor picked from text the reader never sees is wrong before it
 *   ever reaches the plugin.
 */

const article = `
  <article>
    <h1>Everything about soap</h1>
    <p>We make handmade soap using the cold process soap method, which
       takes six weeks to cure properly.</p>
    <p>Our <a href="/shop">shop page</a> lists every bar we sell.</p>
    <pre><code>const lyeCalculator = require("lye");</code></pre>
  </article>
`;

describe("visibleText", () => {
  it("keeps what a reader sees", () => {
    expect(visibleText(article)).toContain("cold process soap");
  });

  it("drops text that is already inside a link", () => {
    // Offering a phrase that's already linked produces an anchor the
    // CMS will refuse — correctly — so it must never be proposed.
    expect(visibleText(article)).not.toContain("shop page");
  });

  it("drops headings", () => {
    expect(visibleText(article)).not.toContain("Everything about soap");
  });

  it("drops code samples", () => {
    expect(visibleText(article)).not.toContain("lyeCalculator");
  });

  it("collapses whitespace so phrases match across line breaks", () => {
    // The fixture wraps "cold process soap method" over two source
    // lines. Without collapsing, no multi-word phrase would ever match.
    expect(visibleText(article)).not.toMatch(/\s{2,}/);
  });
});

describe("pickAnchor", () => {
  it("finds the longest phrase from the target's title", () => {
    const r = pickAnchor(article, "Cold Process Soap Making");
    expect(r).not.toBeNull();
    expect(r?.anchor.toLowerCase()).toBe("cold process soap");
    expect(r?.words).toBe(3);
  });

  it("prefers a longer phrase over a shorter one", () => {
    // Both "cold process soap" and "cold process" are present. The
    // longer is more specific, so it makes the better link.
    const r = pickAnchor(article, "Cold Process Soap");
    expect(r?.words).toBe(3);
  });

  it("returns null when no phrase from the title is on the page", () => {
    // A normal outcome, not an error: two pages can be related without
    // sharing a usable phrase.
    expect(pickAnchor(article, "Beeswax Candle Wicks")).toBeNull();
  });

  it("ignores the site name after a separator", () => {
    // "Cold Process Soap | Dice Soap Co" — everything after the pipe is
    // the site, and linking on the site's own name is not useful.
    const r = pickAnchor(article, "Cold Process Soap | Dice Soap Co");
    expect(r?.anchor.toLowerCase()).toBe("cold process soap");
  });

  it("will not match a phrase that runs into a longer word", () => {
    // "cold process" is a substring of "cold processing", ending
    // mid-word. Linking there produces <a>cold process</a>ing — visibly
    // broken text on a live article.
    //
    // The first version of this test used a case that returned null
    // because of the two-word minimum instead, so deleting the boundary
    // check left it passing. It now fails without the check.
    const html = "<p>We use cold processing for every batch we make.</p>";
    expect(pickAnchor(html, "Cold Process")).toBeNull();
  });

  it("will not match a phrase that starts mid-word", () => {
    const html = "<p>Our supercold process line runs on Tuesdays.</p>";
    expect(pickAnchor(html, "Cold Process")).toBeNull();
  });

  it("still matches when the phrase is bounded by punctuation", () => {
    // The boundary check must not be so strict it rejects normal prose.
    const html = "<p>Try our soap bars, they cure for six weeks.</p>";
    expect(pickAnchor(html, "Soap Bars")?.anchor).toBe("soap bars");
  });

  it("refuses a one-word anchor by default", () => {
    // Single common words match almost anywhere, which is how
    // auto-linkers end up linking nonsense.
    const html = "<p>We sell soap in the shop.</p>";
    expect(pickAnchor(html, "Soap")).toBeNull();
  });

  it("drops stop-words and filler when building the phrase", () => {
    // "The Guide to Cold Process Soap" — "the", "to" and "guide"
    // describe the artefact, not the subject.
    const r = pickAnchor(article, "The Guide to Cold Process Soap");
    expect(r?.anchor.toLowerCase()).toBe("cold process soap");
  });

  it("preserves the casing used on the page", () => {
    // Re-casing the sentence is how a link reads as machine-written.
    const html = "<p>Our Cold Process Soap cures for six weeks.</p>";
    const r = pickAnchor(html, "cold process soap");
    expect(r?.anchor).toBe("Cold Process Soap");
  });

  it("never proposes an anchor that isn't in the visible text", () => {
    // The property that matters most. Whatever comes back must be
    // findable by the CMS, or the write is guaranteed to be refused.
    const titles = [
      "Cold Process Soap Making",
      "Handmade Soap Bars",
      "Six Week Cure Times",
      "Beeswax Candle Wicks",
      "Shop Page Listings",
    ];
    const text = visibleText(article).toLowerCase();
    for (const t of titles) {
      const r = pickAnchor(article, t);
      if (r) expect(text, t).toContain(r.anchor.toLowerCase());
    }
  });

  it("respects the plugin's 80-character anchor limit", () => {
    const long = "a".repeat(90);
    const html = `<p>${long} ${long}</p>`;
    const r = pickAnchor(html, `${long} ${long}`);
    if (r) expect(r.anchor.length).toBeLessThanOrEqual(80);
  });

  it("handles an empty or tag-only page without throwing", () => {
    expect(pickAnchor("", "Cold Process Soap")).toBeNull();
    expect(pickAnchor("<div><span></span></div>", "Cold Process Soap")).toBeNull();
  });

  it("handles a title with no usable words", () => {
    expect(pickAnchor(article, "The and of to")).toBeNull();
  });
});
