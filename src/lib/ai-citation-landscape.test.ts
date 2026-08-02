import { describe, expect, it } from "vitest";
import {
  citationDomain,
  summariseCitations,
  type CitationCheckRow,
} from "./ai-citation-landscape";

/**
 * "Who gets cited instead of you" is the answer the dedicated GEO tools
 * charge for, and it is one aggregation away from data we already store.
 * It is also easy to get confidently wrong in three specific ways, which
 * is what these tests are about.
 */

function row(p: Partial<CitationCheckRow> = {}): CitationCheckRow {
  return {
    provider: "perplexity",
    prompt: "best handmade soap uk",
    citations: [],
    grounding: "live",
    ...p,
  };
}

describe("citationDomain", () => {
  it("strips www, because it's the same publisher", () => {
    expect(citationDomain("https://www.reddit.com/r/soap")).toBe("reddit.com");
  });

  it("keeps deeper subdomains, because they aren't", () => {
    // docs.stripe.com being cited and stripe.com being cited are
    // different facts. Flattening hides which part is winning.
    expect(citationDomain("https://docs.stripe.com/x")).toBe("docs.stripe.com");
  });

  it("copes with a bare domain", () => {
    expect(citationDomain("example.com/page")).toBe("example.com");
  });

  it("returns null for junk rather than inventing a domain", () => {
    expect(citationDomain("")).toBeNull();
    expect(citationDomain("not a url at all !!")).toBeNull();
  });
});

describe("only grounded answers count", () => {
  it("ignores answers the model gave from memory", () => {
    // A memory answer describes what a model absorbed in training. It
    // is not evidence about AI search today, and mixing the two
    // produces a number that describes neither.
    const r = summariseCitations(
      [
        row({ grounding: "memory", citations: ["https://reddit.com/a"] }),
        row({ grounding: "memory", citations: ["https://reddit.com/b"] }),
      ],
      "example.com",
    );
    expect(r.groundedAnswers).toBe(0);
    expect(r.competitors).toHaveLength(0);
    expect(r.memoryAnswersIgnored).toBe(2);
  });

  it("says why the result is empty when everything was memory", () => {
    const r = summariseCitations(
      [row({ grounding: "memory", citations: ["https://reddit.com/a"] })],
      "example.com",
    );
    expect(r.note).toMatch(/training memory/i);
    expect(r.note).toMatch(/web search/i);
  });

  it("distinguishes 'no checks yet' from 'no grounded checks'", () => {
    const none = summariseCitations([], "example.com");
    expect(none.note).toMatch(/no ai visibility checks/i);
  });
});

describe("the denominator is answers, not URLs", () => {
  it("counts a domain once per answer however often it appears", () => {
    // Otherwise a page quoted four times in one response outranks a
    // domain cited once in every response, which is backwards.
    const r = summariseCitations(
      [
        row({
          citations: [
            "https://reddit.com/r/soap/1",
            "https://reddit.com/r/soap/2",
            "https://reddit.com/r/soap/3",
            "https://reddit.com/r/soap/4",
          ],
        }),
      ],
      "example.com",
    );
    expect(r.competitors[0].domain).toBe("reddit.com");
    expect(r.competitors[0].answersCiting).toBe(1);
  });

  it("ranks consistency across answers above volume within one", () => {
    const rows: CitationCheckRow[] = [
      row({ prompt: "q1", citations: ["https://loud.com/a", "https://loud.com/b", "https://loud.com/c"] }),
      row({ prompt: "q2", citations: ["https://steady.com/a"] }),
      row({ prompt: "q3", citations: ["https://steady.com/b"] }),
    ];
    const r = summariseCitations(rows, "example.com");
    expect(r.competitors[0].domain).toBe("steady.com");
    expect(r.competitors[0].answersCiting).toBe(2);
  });
});

describe("your own share", () => {
  it("separates you from the competitor list", () => {
    const r = summariseCitations(
      [
        row({ citations: ["https://example.com/x", "https://reddit.com/a"] }),
        row({ citations: ["https://reddit.com/b"] }),
      ],
      "https://example.com",
    );
    expect(r.yourAnswersCiting).toBe(1);
    expect(r.yourSharePct).toBe(50);
    expect(r.competitors.map((c) => c.domain)).not.toContain("example.com");
  });

  it("treats a subdomain of your site as you", () => {
    const r = summariseCitations(
      [row({ citations: ["https://blog.example.com/post"] })],
      "example.com",
    );
    expect(r.yourAnswersCiting).toBe(1);
    expect(r.competitors).toHaveLength(0);
  });

  it("does not mistake a lookalike domain for you", () => {
    // notexample.com ends with "example.com" as a string. It is not you.
    const r = summariseCitations(
      [row({ citations: ["https://notexample.com/x"] })],
      "example.com",
    );
    expect(r.yourAnswersCiting).toBe(0);
    expect(r.competitors[0].domain).toBe("notexample.com");
  });

  it("reports zero share honestly when nothing cites you", () => {
    const r = summariseCitations(
      [row({ citations: ["https://reddit.com/a"] })],
      "example.com",
    );
    expect(r.yourAnswersCiting).toBe(0);
    expect(r.yourSharePct).toBe(0);
  });
});

describe("small samples are labelled as small", () => {
  it("calls a handful of answers low confidence", () => {
    const r = summariseCitations(
      [row({ citations: ["https://reddit.com/a"] })],
      "example.com",
    );
    expect(r.confidence).toBe("low");
    expect(r.note).toMatch(/too few/i);
  });

  it("only calls it usable once there is enough to see a pattern", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ prompt: `q${i}`, citations: ["https://reddit.com/a"] }),
    );
    const r = summariseCitations(rows, "example.com");
    expect(r.confidence).toBe("usable");
    expect(r.competitors[0].sharePct).toBe(100);
  });

  it("never claims a share of voice from zero answers", () => {
    const r = summariseCitations([], "example.com");
    expect(r.confidence).toBe("none");
    expect(r.yourSharePct).toBe(0);
  });
});

describe("context for acting on it", () => {
  it("records which AI surfaces cited each domain", () => {
    const r = summariseCitations(
      [
        row({ provider: "perplexity", citations: ["https://reddit.com/a"] }),
        row({ provider: "google_ai_mode", citations: ["https://reddit.com/b"] }),
      ],
      "example.com",
    );
    expect(r.competitors[0].providers).toEqual(["google_ai_mode", "perplexity"]);
  });

  it("keeps a few example queries, not all of them", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ prompt: `query ${i}`, citations: ["https://reddit.com/a"] }),
    );
    const r = summariseCitations(rows, "example.com");
    expect(r.competitors[0].exampleQueries.length).toBeLessThanOrEqual(3);
    expect(r.competitors[0].exampleQueries.length).toBeGreaterThan(0);
  });

  it("survives a check with no citations at all", () => {
    const r = summariseCitations([row({ citations: null }), row({ citations: [] })], "example.com");
    expect(r.groundedAnswers).toBe(2);
    expect(r.competitors).toHaveLength(0);
    expect(r.yourSharePct).toBe(0);
  });
});
