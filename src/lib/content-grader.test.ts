import { describe, expect, it } from "vitest";
import { gradeAgainstCorpus, type CorpusInsights } from "./content-grader";

/**
 * What the content score rewards.
 *
 * The grader's method is sound and matches what Clearscope and Surfer
 * do: pull the pages that actually rank, work out what they cover, and
 * score a draft against that. The scoring drifted, though — 20 of the
 * 100 points were awarded for hitting a keyword-density band.
 *
 * CLAUDE.md §3.7 names "keyword density should be 2-3%" as folklore this
 * tool will not repeat, and it isn't merely inert: a writer chasing
 * those points is being told to repeat an exact-match phrase in prose
 * that didn't need it, which is the behaviour Google's spam guidance is
 * aimed at. It also pulled against the coverage score, which rewards
 * the legitimate thing.
 *
 * These tests exist so it can't drift back. The rule is one sentence:
 * repeating the keyword more must never raise the score.
 */

// No `as CorpusInsights` cast here, deliberately. The first version of
// this fixture used one and invented field names — the real type has
// `medianWordCount`, not `targetWordCount` — so the length target was
// computed from `undefined` and two tests failed for reasons that had
// nothing to do with what they were testing. A cast on a fixture turns
// the compiler off exactly where it was about to be useful.
function corpus(overrides: Partial<CorpusInsights> = {}): CorpusInsights {
  return {
    corpusSize: 10,
    medianWordCount: 1000,
    wordCounts: [900, 950, 1000, 1050, 1100],
    avgKeywordDensityPct: 1.0,
    topTerms: [
      { term: "soap", corpusFreq: 10, weight: 10 },
      { term: "lye", corpusFreq: 9, weight: 8 },
      { term: "saponification", corpusFreq: 7, weight: 6 },
      { term: "cure", corpusFreq: 6, weight: 4 },
      { term: "mould", corpusFreq: 4, weight: 2 },
    ],
    recurringHeadings: [],
    sources: [],
    ...overrides,
  };
}

/** A draft of `words` words that mentions `keyword` `hits` times. */
function draft(words: number, keyword: string, hits: number): string {
  const filler = "soap lye saponification cure mould batch oil water trace";
  const body: string[] = [];
  for (let i = 0; i < hits; i++) body.push(keyword);
  const parts = filler.split(" ");
  let i = 0;
  while (body.length < words) body.push(parts[i++ % parts.length]);
  return body.join(" ");
}

const KEYWORD = "cold process soap";

describe("keyword density is not scored", () => {
  it("repeating the keyword more does not raise the score", () => {
    // The single property that matters. If this fails, the tool is
    // telling writers to stuff again.
    //
    // 2 hits per 1000 words (0.2%) against 10 (1.0%) — chosen to
    // straddle the old 0.5-1.5% band exactly. An earlier version of
    // this test compared 3 hits against 40, which lands *outside* the
    // band on both sides, so it passed even with the old scoring
    // restored and guarded nothing.
    const light = gradeAgainstCorpus({
      content: draft(1000, KEYWORD, 2),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    const onTheOldTarget = gradeAgainstCorpus({
      content: draft(1000, KEYWORD, 10),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(onTheOldTarget.score).toBeLessThanOrEqual(light.score);
  });

  it("a draft that barely repeats the keyword can still score full marks", () => {
    // Good writing covers a topic without hammering one phrase. Under
    // the old scoring this draft was capped at 80.
    const r = gradeAgainstCorpus({
      content: draft(1000, KEYWORD, 1),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(r.score).toBeGreaterThanOrEqual(95);
  });

  it("reports no density points in the breakdown", () => {
    const r = gradeAgainstCorpus({
      content: draft(1000, KEYWORD, 10),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(r.breakdown.densityScore).toBe(0);
  });

  it("length and coverage account for the whole score", () => {
    const r = gradeAgainstCorpus({
      content: draft(1000, KEYWORD, 5),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(r.breakdown.lengthScore + r.breakdown.coverageScore).toBe(r.score);
  });
});

describe("what it does still tell you", () => {
  it("never suggests using the keyword more often", () => {
    // The one recommendation on this screen that could make a page
    // worse. It used to fire whenever density was under 0.5%.
    const r = gradeAgainstCorpus({
      content: draft(1000, KEYWORD, 1),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    for (const rec of r.recommendations) {
      expect(rec.toLowerCase()).not.toMatch(/use .* more often|more frequently/);
    }
  });

  it("warns when a phrase is genuinely stuffed", () => {
    // The one direction that is a real signal. 3.5%+ of all words being
    // one phrase reads as spam to a person, never mind an algorithm.
    const r = gradeAgainstCorpus({
      content: draft(300, KEYWORD, 60),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(r.recommendations.join(" ").toLowerCase()).toMatch(/stuffed/);
  });

  it("still tells you which terms the ranking pages cover that you don't", () => {
    // The legitimate signal, and now the largest component of the score.
    const r = gradeAgainstCorpus({
      content: "soap and more soap, mostly about soap",
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(r.missingTerms).toContain("saponification");
    expect(r.recommendations.join(" ")).toMatch(/saponification/);
  });

  it("still flags a draft well short of what ranks", () => {
    const r = gradeAgainstCorpus({
      content: draft(120, KEYWORD, 2),
      targetKeyword: KEYWORD,
      insights: corpus(),
    });
    expect(r.recommendations.join(" ")).toMatch(/more words/i);
  });
});
