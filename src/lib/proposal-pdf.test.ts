import { describe, expect, it } from "vitest";
import { generateProposalPdf, type ProposalDoc } from "./proposal-pdf";

/**
 * The client's document renders, with and without the new sections.
 *
 * There is exactly one render path for this document and it is a PDF, so
 * "does it throw" is not a trivial question: a layout mistake in the
 * keyword table would surface as a 500 on the only link the user hands
 * their client.
 *
 * The older-document cases matter as much as the new ones. Rows written
 * before the keyword map, the phases and the surfaces existed are still
 * in the database and must keep rendering exactly as they did.
 */

const BASE: ProposalDoc = {
  prospectName: "Dice Codes",
  prospectUrl: "https://dicecodes.com/",
  title: "SEO plan — Dice Codes",
  intro: "We went through the site and this is what we would like to do.",
  scope: [
    { label: "Technical fixes", detail: "Redirects and speed.", findings: 14 },
  ],
  pricing: [],
  currency: "USD",
  terms: null,
  basedOnScore: 72,
  basedOnAt: new Date("2026-09-01T00:00:00Z"),
};

function pdfLooksValid(buf: Buffer) {
  expect(buf.byteLength).toBeGreaterThan(1000);
  // Every PDF starts with this. A thrown-away error page would not.
  expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
}

describe("a document with everything", () => {
  it("renders surfaces, a keyword map and phased weeks", async () => {
    const buf = await generateProposalPdf({
      ...BASE,
      surfaces: {
        inScope: [
          { label: "Their website", detail: "Titles, speed, technical health." },
          { label: "Local presence", detail: "Google Business Profile and reviews." },
        ],
        outOfScope: [{ label: "Product and category pages" }],
      },
      keywordBaseline: {
        tracked: 3,
        ranking: 2,
        inTopTen: 1,
        strikingDistance: 1,
        examples: [{ keyword: "seo company punjab", position: 8 }],
        map: [
          {
            keyword: "seo company punjab",
            intent: "commercial",
            position: 8,
            targetPage: "/seo-services",
          },
          {
            keyword: "what is technical seo",
            intent: "informational",
            position: 14,
            targetPage: "/blog/technical-seo",
          },
          // The one that matters: tracked, never ranked. It must appear.
          {
            keyword: "ecommerce developer ludhiana",
            intent: "transactional",
            position: null,
            targetPage: null,
          },
        ],
      },
      timeline: [
        { week: "Week 1", focus: "technical foundations", items: ["Fix redirects"], phase: "Foundation · days 1-30" },
        { week: "Week 6", focus: "content", items: ["Publish a guide"], phase: "Content and authority · days 31-60" },
        { week: "Week 11", focus: "links and outreach", items: ["Outreach"], phase: "Compound growth · days 61-90" },
      ],
    });
    pdfLooksValid(buf);
  });

  it("survives a long keyword list without blowing up the layout", async () => {
    // Thirteen weeks of plan and fifty keywords is an ordinary agency
    // document, and it has to paginate rather than throw.
    const buf = await generateProposalPdf({
      ...BASE,
      keywordBaseline: {
        tracked: 50,
        ranking: 30,
        inTopTen: 10,
        strikingDistance: 12,
        examples: [],
        map: Array.from({ length: 50 }, (_, i) => ({
          keyword: `a fairly long tail keyword phrase number ${i} that goes on`,
          intent: i % 2 ? "commercial" : "informational",
          position: i < 30 ? i + 1 : null,
          targetPage: i < 30 ? `/some/quite/long/path/segment-${i}` : null,
        })),
      },
      timeline: Array.from({ length: 13 }, (_, i) => ({
        week: `Week ${i + 1}`,
        focus: "ongoing work",
        items: ["One", "Two", "Three", "Four", "Five"],
        phase:
          i < 4
            ? "Foundation · days 1-30"
            : i < 9
              ? "Content and authority · days 31-60"
              : "Compound growth · days 61-90",
      })),
    });
    pdfLooksValid(buf);
  });
});

describe("documents written before these sections existed", () => {
  it("renders with no surfaces, no map and no phases", async () => {
    const buf = await generateProposalPdf({
      ...BASE,
      keywordBaseline: {
        tracked: 2,
        ranking: 1,
        inTopTen: 1,
        strikingDistance: 0,
        examples: [{ keyword: "old keyword", position: 4 }],
        // No `map` — falls back to the "For example:" sentence.
      },
      timeline: [{ week: "Week 1", focus: "technical foundations", items: ["Fix redirects"] }],
    });
    pdfLooksValid(buf);
  });

  it("renders an ordinary sales proposal, with none of this", async () => {
    // The same generator serves plain proposals. Every kickoff section is
    // optional and none of them may leak into one.
    const buf = await generateProposalPdf({
      ...BASE,
      pricing: [{ label: "Monthly retainer", detail: "Ongoing", amount: 1200 }],
      terms: "Net 30.",
    });
    pdfLooksValid(buf);
  });

  it("renders with an empty scope and nothing else at all", async () => {
    const buf = await generateProposalPdf({
      ...BASE,
      intro: null,
      scope: [],
      basedOnScore: null,
      basedOnAt: null,
    });
    pdfLooksValid(buf);
  });
});
