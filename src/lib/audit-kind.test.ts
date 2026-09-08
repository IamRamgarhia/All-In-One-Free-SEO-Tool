import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Anything reading "the latest audit" must say which kind it means.
 *
 * The audits table holds two different things. A crawl (kind "crawler")
 * produces the 72 finding types the rest of the app understands. The AI
 * site audit (kind "ai_full") writes into the same table with its own
 * check ids — "schema_valid", "word_count" — which nothing downstream
 * can plan, explain or fix.
 *
 * The planner took the newest row of any kind and any status. So running
 * an AI audit after a crawl made the agent stop finding work: it read 27
 * AI rows, matched none against FIXABLE, and reported nothing to do
 * while a crawl with 134 findings sat one row above. A failed or still
 * running crawl did the same thing.
 *
 * Nothing errored. The agent simply went quiet, which is indistinguishable
 * from a clean site.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

/** Files whose whole job depends on reading a real, finished crawl. */
const READERS = ["lib/agent/planner.ts", "lib/next-actions.ts"];

describe("reading the latest audit", () => {
  for (const file of READERS) {
    it(`${file} filters to a completed crawl`, () => {
      const text = src(file);
      const start = text.indexOf(".from(audits)");
      expect(start, `${file} no longer queries the audits table`).toBeGreaterThan(-1);

      // The where-clause of the audits query, generously bounded.
      const clause = text.slice(Math.max(0, start - 400), start + 600);

      expect(
        /audits\.status/.test(clause),
        `${file} picks an audit without checking its status, so a failed ` +
          `or still-running crawl can become "the" audit and the caller ` +
          `finds nothing.`,
      ).toBe(true);

      expect(
        /audits\.kind/.test(clause),
        `${file} picks an audit without checking its kind. The AI site ` +
          `audit writes to this table with check ids nothing downstream ` +
          `understands, so one AI audit hides the crawl entirely.`,
      ).toBe(true);
    });
  }

  it("the two kinds are the ones the schema declares", () => {
    // If these names change, the filters above go quietly false.
    const schema = src("db/schema.ts");
    expect(schema).toMatch(/"crawler"/);
    expect(schema).toMatch(/"ai_full"/);
  });
});
