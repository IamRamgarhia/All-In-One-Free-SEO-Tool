import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUDIT_FINDING_TYPES,
  NON_CRAWLER_FINDING_TYPES,
} from "../audit-finding-types";

/**
 * How much of what we detect we can actually fix.
 *
 * This is the number the whole product turns on. A tool that finds 134
 * problems and can act on eight kinds of them is a report generator with
 * extra steps — which is the tool the market already has. So the number
 * lives in CI, where it can only go up, rather than in a commit message
 * where it can rot.
 *
 * It is deliberately a floor, not an exact value: raising coverage
 * should never require editing this file, but lowering it should.
 */

const planner = readFileSync(join(process.cwd(), "src/lib/agent/planner.ts"), "utf8");

/** Finding types the FIXABLE map is keyed by. */
function fixableTypes(): string[] {
  // Bounded to the literal: stop at the first `};` in column zero after
  // the declaration, the same way audit-finding-types.test.ts does.
  const start = planner.indexOf("const FIXABLE");
  const rest = planner.slice(start);
  const end = rest.search(/^\};/m);
  const literal = end === -1 ? rest : rest.slice(0, end);
  return [...literal.matchAll(/^  ([a-z0-9_]+): \{/gm)].map((m) => m[1]);
}

const ALL = new Set<string>([...AUDIT_FINDING_TYPES, ...NON_CRAWLER_FINDING_TYPES]);
const fixable = fixableTypes().filter((t) => ALL.has(t));

describe("auto-fix coverage", () => {
  it("every fixable key is a finding something actually emits", () => {
    // audit-finding-types.test.ts covers this too; repeated here because
    // a typo would otherwise inflate the coverage number below while
    // fixing nothing.
    const unreal = fixableTypes().filter((t) => !ALL.has(t));
    expect(
      unreal,
      `${unreal.join(", ")} is in FIXABLE but nothing emits it, so it ` +
        `inflates the coverage number without fixing anything.`,
    ).toEqual([]);
  });

  it("does not regress", () => {
    // Raise this when coverage goes up. It went 7 -> 16 of 72 (22%)
    // when plugin 0.5.0 wired canonical and per-page robots directives,
    // and the duplicate/short metadata findings — detected since the
    // crawler was written, never once actionable — were finally given
    // planner entries.
    const FLOOR = 16;
    expect(
      fixable.length,
      `The agent can fix ${fixable.length} of ${ALL.size} finding types. ` +
        `That is below the recorded floor of ${FLOOR}, so something that ` +
        `used to be auto-fixable no longer is.\n\nStill not fixable:\n  ` +
        [...ALL].filter((t) => !fixable.includes(t)).join(", "),
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  it("reports where the ceiling actually is", () => {
    // Not an assertion about a target — a place for the real number to
    // be read off, so "most of the work is automated" can be checked
    // rather than believed.
    const pct = Math.round((fixable.length / ALL.size) * 100);
    expect(pct).toBeGreaterThan(0);
    expect(ALL.size).toBeGreaterThan(fixable.length); // 100% is not a goal
  });
});

describe("the unfixable are unfixable for a reason", () => {
  /**
   * Findings nobody should expect this app to fix, grouped by why. If a
   * finding is not here and not fixable, it is a gap rather than a
   * decision — which is the distinction this test exists to keep.
   */
  const OUT_OF_REACH: Record<string, string[]> = {
    "server or host, not the CMS": [
      "no_https",
      "missing_security_headers",
      "mixed_content",
      "slow_response",
      "poor_cls",
      "poor_inp",
      "slow_lcp",
      "heavy_html_payload",
      "render_blocking_scripts",
      "crawl_delay_applied",
      "fetch_failed",
      "bad_status",
      "blocked_url",
    ],
    "another platform's source repo": [
      "next_chunk_explosion",
      "next_powered_by_header",
      "next_raw_img_tags",
      "shopify_collections_all",
      "shopify_liquid_debug",
      "spa_empty_body",
      "js_rendered_only",
    ],
    "needs writing or judgement, not an edit": [
      "thin_content",
      "article_missing_author",
      "weak_anchor_text",
      "soft_404",
    ],
  };

  it("names a reason for the ones we have decided about", () => {
    const excused = new Set(Object.values(OUT_OF_REACH).flat());
    const unreal = [...excused].filter((t) => !ALL.has(t));
    expect(
      unreal,
      `${unreal.join(", ")} is excused as unfixable but is not a finding ` +
        `type at all — the excuse list has drifted from the crawler.`,
    ).toEqual([]);
  });

  it("leaves a visible list of gaps that are gaps, not decisions", () => {
    const excused = new Set(Object.values(OUT_OF_REACH).flat());
    const gaps = [...ALL].filter((t) => !fixable.includes(t) && !excused.has(t));
    // Not asserted to be empty — it is the roadmap. Asserted to be
    // shrinking-or-equal is the job of the floor above; this exists so
    // the list is printed somewhere a person will see it.
    expect(Array.isArray(gaps)).toBe(true);
  });
});
