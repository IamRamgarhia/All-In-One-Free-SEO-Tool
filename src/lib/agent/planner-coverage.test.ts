import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUDIT_FINDING_TYPES,
  NON_CRAWLER_FINDING_TYPES,
} from "../audit-finding-types";
import { FIXED_WITHOUT_FINDING } from "./planner";

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

/**
 * Everything the agent can act on — not everything FIXABLE is keyed by.
 *
 * This counted FIXABLE keys alone and so reported `orphan_pages` as
 * unfixable while the agent had been fixing it since internal linking
 * shipped: step 1b of planAgentRun plans those from a whole-site crawl,
 * with no finding to key on. The headline number was one too low and
 * the printed roadmap listed work already done.
 *
 * The lesson is the one this file was written for, pointed at itself: a
 * metric that measures the implementation rather than the behaviour
 * drifts the moment the implementation grows a second path.
 */
const fixable = [
  ...new Set([
    ...fixableTypes().filter((t) => ALL.has(t)),
    ...[...FIXED_WITHOUT_FINDING].filter((t) => ALL.has(t)),
  ]),
];

describe("auto-fix coverage", () => {
  it("every type fixed without a finding is really planned somewhere", () => {
    // This list is the one place coverage can be claimed without a
    // FIXABLE entry to point at, so it is the one place a number could
    // be inflated by typing into a Set. Each entry has to be a real
    // finding type AND have no FIXABLE key — if it gained one, the
    // planner would be proposing the work twice and this list is stale.
    for (const type of FIXED_WITHOUT_FINDING) {
      expect(
        ALL.has(type),
        `${type} is claimed as fixable-without-a-finding but is not a ` +
          `finding type at all, so it inflates coverage and fixes nothing.`,
      ).toBe(true);
      expect(
        fixableTypes(),
        `${type} now has a FIXABLE entry too, so the planner proposes it ` +
          `twice — once per page and once from the site-wide pass. Remove ` +
          `it from FIXED_WITHOUT_FINDING.`,
      ).not.toContain(type);
    }
  });

  it("orphan_pages is planned by the site-wide pass", () => {
    // The specific claim, asserted against the planner source rather
    // than trusted: step 1b exists, is reached when the capability is
    // present, and emits write_internal_links for an orphan.
    expect(FIXED_WITHOUT_FINDING.has("orphan_pages")).toBe(true);
    expect(planner).toContain("planInternalLinks");
    expect(planner).toMatch(/kind:\s*"write_internal_links"/);
    expect(planner).toMatch(/for \(const orphan of analysis\.orphans\)/);
  });

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
    // Raise this when coverage goes up. 7 -> 16 -> 18 -> 29 of 72 (40%):
    // plugin 0.5.0 wired canonical and per-page robots directives; the
    // duplicate/short metadata findings — detected since the crawler was
    // written, never once actionable — were finally given planner
    // entries; then the two AI-crawler-policy findings became the first
    // site-wide fix the agent can apply; then redirects, site hardening,
    // internal links, schema and social meta.
    //
    // It sat at 18 while the real number was 29, which is the failure
    // this test exists to prevent pointed at itself: a floor nobody
    // raises stops being a floor.
    //
    // 29 -> 30 on 30 Oct 2026 with no new fix written: orphan_pages was
    // always fixable and this test could not see it, because it counted
    // FIXABLE keys rather than what the planner acts on. See
    // FIXED_WITHOUT_FINDING.
    const FLOOR = 30;
    expect(
      fixable.length,
      `The agent can fix ${fixable.length} of ${ALL.size} finding types. ` +
        `That is below the recorded floor of ${FLOOR}, so something that ` +
        `used to be auto-fixable no longer is.\n\nStill not fixable:\n  ` +
        [...ALL].filter((t) => !fixable.includes(t)).join(", "),
    ).toBeGreaterThanOrEqual(FLOOR);
  });

  it("matches the number README.md tells the world", () => {
    /**
     * Rule 3, and the MCP tool count's lesson applied to the other
     * number in the README. The two had already drifted when this was
     * written: README said "29 of the crawler's 72 finding types" and
     * then listed "internal links to orphan pages" among them — the
     * prose counted it, the number did not.
     *
     * The floor above stops coverage regressing. This stops the README
     * from describing a different product.
     */
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");
    const m = readme.match(
      /It can fix (\d+) of the crawler.s (\d+) finding types/,
    );
    expect(
      m,
      "README.md no longer states the coverage number in the form this " +
        "test reads. Keep the sentence or update the pattern — do not " +
        "delete the only check that the two agree.",
    ).not.toBeNull();
    expect(Number(m![1])).toBe(fixable.length);
    expect(Number(m![2])).toBe(ALL.size);
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
      // Moved here 30 Oct 2026. The decision not to fix this was already
      // written down — in a comment in planner.ts, beside the robots.txt
      // entries: a robots.txt that does not parse can only be repaired
      // by knowing what the author meant, and a Disallow with a typo may
      // be protecting something. Guessing is the one mistake in that
      // file that can deindex a site.
      //
      // Being documented there and not here meant this test counted it
      // as a gap, which is precisely the distinction the test exists to
      // keep. A decision recorded where the test cannot see it reads as
      // an omission for as long as nobody re-reads the planner.
      "invalid_robots_txt",
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
    //
    // It did not print. The assertion was `Array.isArray(gaps)`, which
    // passes in silence, so the roadmap this test exists to surface was
    // visible only to someone who re-derived it by hand. Now it prints.
    console.info(
      `\n  auto-fix coverage: ${fixable.length} of ${ALL.size} finding types ` +
        `(${Math.round((fixable.length / ALL.size) * 100)}%)\n` +
        `  ${excused.size} excused as out of reach\n` +
        `  ${gaps.length} gaps, neither fixable nor excused:\n` +
        gaps.map((g) => `    - ${g}`).join("\n") +
        "\n",
    );
    expect(Array.isArray(gaps)).toBe(true);
  });
});
