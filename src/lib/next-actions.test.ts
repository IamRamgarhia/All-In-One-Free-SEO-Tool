/**
 * The ranking, the drop detector, and the labels.
 *
 * `nextActions` itself reads the database and so is not covered here —
 * `pnpm test` deliberately stays free of the SQLite handle. What IS
 * covered is every piece of judgement it delegates to, because each one
 * of these fails silently: a wrong rank produces a plausible list in the
 * wrong order, and a missed drop produces a shorter list that looks
 * calmer than the truth.
 */

import { describe, expect, it } from "vitest";
import {
  BLOCKING_FLOOR,
  MAX_ORDINARY_SCORE,
  OFF_RESULTS,
  describeIssue,
  describeMove,
  detectDrops,
  partitionByOwner,
  rank,
  type NextAction,
  type RankPoint,
} from "./next-actions";

/** Newest-first, the order the query returns and detectDrops requires. */
function history(query: string, ...newestFirst: (number | null)[]): RankPoint[] {
  return newestFirst.map((position) => ({ query, position }));
}

describe("detectDrops", () => {
  it("reports a keyword that fell out of the results entirely", () => {
    // The case the previous version could never report: it skipped null
    // positions, so the worst possible outcome looked like no data.
    const [drop] = detectDrops(history("emergency plumber leeds", null, 4));
    expect(drop).toBeDefined();
    expect(drop.from).toBe(4);
    expect(drop.to).toBe(OFF_RESULTS);
    expect(drop.lost).toBeGreaterThanOrEqual(5);
  });

  it("reports a fall past the top 20", () => {
    // Also previously invisible: the SQL filtered to position < 21, so a
    // fall to #40 had its newest row discarded for being too far.
    const [drop] = detectDrops(history("boiler service", 40, 4));
    expect(drop).toMatchObject({ from: 4, to: 40, lost: 36 });
  });

  it("ignores movement among positions nobody was winning anyway", () => {
    // #78 to #91 is noise, not a loss. The baseline has to have been
    // worth having.
    expect(detectDrops(history("very long tail phrase", 91, 78))).toEqual([]);
  });

  it("ignores a small wobble", () => {
    expect(detectDrops(history("plumber leeds", 6, 4))).toEqual([]);
  });

  it("does not call a recovery a drop", () => {
    // Newest-first: this went from #19 up to #3. Reversing the input
    // order is the one mistake that turns every win into an alarm.
    expect(detectDrops(history("drain unblocking", 3, 19))).toEqual([]);
  });

  it("needs two readings before it will claim anything", () => {
    expect(detectDrops(history("brand new keyword", 40))).toEqual([]);
  });

  it("puts the worst drop first, so the caller can name one", () => {
    const rows = [
      ...history("small slide", 12, 4),
      ...history("gone entirely", null, 2),
      ...history("medium slide", 30, 5),
    ];
    const drops = detectDrops(rows);
    expect(drops.map((d) => d.query)).toEqual([
      "gone entirely",
      "medium slide",
      "small slide",
    ]);
  });

  it("compares oldest against newest, not adjacent readings", () => {
    // A keyword that drifted down over four checks has lost 14 places
    // even though no single step lost 5.
    const [drop] = detectDrops(history("gradual decline", 17, 13, 8, 3));
    expect(drop).toMatchObject({ from: 3, to: 17, lost: 14 });
  });
});

describe("describeMove", () => {
  it("says so plainly when a keyword is gone rather than printing #100", () => {
    expect(
      describeMove({ query: "q", from: 4, to: OFF_RESULTS, lost: 96 }),
    ).toBe("fell from #4 out of the results entirely");
  });

  it("names both positions for an ordinary fall", () => {
    expect(describeMove({ query: "q", from: 4, to: 22, lost: 18 })).toBe(
      "fell from #4 to #22",
    );
  });
});

describe("rank", () => {
  it("prefers the job that will actually get done today", () => {
    // A 60-impact job that takes five minutes beats an 80-impact job that
    // takes a day. That is the whole premise of the ordering.
    expect(rank(60, 5)).toBeGreaterThan(rank(80, 480));
  });

  it("floors effort, so a one-minute task cannot dominate the list", () => {
    expect(rank(10, 1)).toBe(rank(10, 5));
  });

  it("never reaches the blocking floor", () => {
    // The guarantee blockers depend on. If an ordinary item could score
    // 10,000 it would sit among the things that must happen first.
    expect(rank(100, 1)).toBe(MAX_ORDINARY_SCORE);
    expect(MAX_ORDINARY_SCORE).toBeLessThan(BLOCKING_FLOOR);
  });
});

describe("describeIssue", () => {
  const issue = (type: string, message: string, count = 1) => ({
    type,
    message,
    count,
  });

  it("uses the sentence, not the jargon, for a crawler finding", () => {
    // "fetch_failed" rendered as "fetch failed", which reads as a bug
    // report rather than as something to do.
    expect(
      describeIssue(issue("fetch_failed", "No pages reachable. Check the URL or your network.")),
    ).toBe("No pages reachable");
  });

  it("takes the label and leaves the advice behind", () => {
    // 108 characters whole, so the old rule fell back to the type and
    // printed "wp default permalinks". The first sentence fits and says
    // more than the type name ever could.
    expect(
      describeIssue(
        issue(
          "wp_default_permalinks",
          "Pages link to /?p=123 (default permalink). Switch to %postname% for readable, keyword-friendly URLs.",
          14,
        ),
      ),
    ).toBe("Pages link to /?p=123 (default permalink) — on 14 pages");
  });

  it("leaves a one-sentence message with an em dash alone", () => {
    expect(
      describeIssue(issue("long_title", "Title is 61 characters — Google may truncate beyond ~60.")),
    ).toBe("Title is 61 characters — Google may truncate beyond ~60");
  });

  it("uses the sentence for an AI-audit check id", () => {
    // The AI audit names the CHECK, so the type says "schema_valid" for a
    // row that means schema is broken — the exact inverse of the finding.
    expect(describeIssue(issue("schema_valid", "1 block has errors."))).toBe(
      "1 block has errors",
    );
  });

  it("falls back to the type when the message is a paragraph", () => {
    const essay =
      "Article-type page has no author byline or Person schema — Google's E-E-A-T guidance treats authorship as a signal of expertise, and this page offers none.";
    expect(describeIssue(issue("article_missing_author", essay))).toBe(
      "article missing author",
    );
  });

  it("adds the page count when the message does not carry one", () => {
    expect(describeIssue(issue("missing_title", "Missing <title> tag.", 14))).toBe(
      "Missing <title> tag — on 14 pages",
    );
  });

  it("does not name two different counts for the same thing", () => {
    // "4 pages share the same meta description — on 14 pages" gives the
    // reader two numbers and a reason to trust neither.
    expect(
      describeIssue(issue("duplicate_meta_description", "4 pages share the same meta description.", 14)),
    ).toBe("4 pages share the same meta description");
  });

  it("still says something when the message is empty", () => {
    expect(describeIssue(issue("wp_default_permalinks", "", 14))).toBe(
      "wp default permalinks — on 14 pages",
    );
  });
});

describe("partitionByOwner", () => {
  const item = (id: string, owner: NextAction["owner"]): NextAction => ({
    id,
    clientId: 1,
    clientName: "A client",
    title: id,
    why: "because",
    score: 1,
    minutes: 5,
    owner,
    href: "/",
    because: "a reason",
  });

  it("loses nothing", () => {
    // The panel renders only these two groups. Anything that fell out of
    // both would vanish from the UI without any error.
    const items = [
      item("a", "agent"),
      item("b", "you"),
      item("c", "agent"),
    ];
    const { agent, you } = partitionByOwner(items);
    expect(agent.length + you.length).toBe(items.length);
    expect([...agent, ...you].map((i) => i.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("keeps the incoming order within each group", () => {
    const { you } = partitionByOwner([
      item("first", "you"),
      item("mid", "agent"),
      item("second", "you"),
    ]);
    expect(you.map((i) => i.id)).toEqual(["first", "second"]);
  });
});
