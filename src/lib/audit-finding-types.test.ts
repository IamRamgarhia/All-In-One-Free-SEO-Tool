import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUDIT_FINDING_TYPES,
  NON_CRAWLER_FINDING_TYPES,
} from "./audit-finding-types";
// Imported, not parsed. keysOf() stops at the first `};` in column zero,
// and a fix guide containing a next.config.js sample has exactly that —
// so four guides became invisible to this test the moment one was
// written. These are real exported objects; reading them is simpler and
// immune to whatever a code sample happens to contain.
import {
  ISSUE_EXPLAINERS,
  AI_AUDIT_EXPLAINER_ALIASES,
  getExplainer,
} from "./issue-explainers";
import { TECH_ISSUE_EXPLAINERS } from "./issue-explainers-tech";

/**
 * Finding-type names, across every list that uses them.
 *
 * Four lists existed and all four had drifted from the crawler:
 *
 *   agent FIXABLE     4 of 7 names never emitted — so alt text, long
 *                     titles and long descriptions could never be
 *                     planned from a real audit, despite alt text having
 *                     a capability, an executor branch and an end-to-end
 *                     test written for it
 *   quick wins        9 of 16 never emitted
 *   issue explainers  13 of 22 never displayed
 *
 * Nothing threw. Each list read fine in isolation; the only symptom was
 * work silently not happening. Reading these files will not catch it —
 * comparing them will, which is what this does.
 *
 * The crawler's source is parsed rather than imported because its
 * `type:` strings are inline literals; there is no runtime value to
 * check against. Regex over source is crude, and it is the only thing
 * that can see a name that exists nowhere else.
 */

const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

/**
 * Every `type: "..."` an audit can emit.
 *
 * Both files, not just audit.ts. Scanning one of them was itself the bug
 * this test exists to catch: all 16 tech-stack findings live in
 * tech-audit-rules.ts, so every one of them reached users with no fix
 * guide while this test passed. The guard had a blind spot exactly the
 * shape of a file.
 */
const FINDING_SOURCES = ["lib/audit.ts", "lib/tech-audit-rules.ts"];

function typesEmittedByCrawler(): Set<string> {
  const out = new Set<string>();
  for (const file of FINDING_SOURCES) {
    for (const m of src(file).matchAll(/type:\s*"([a-z0-9_]+)"/g)) {
      out.add(m[1]);
    }
  }
  return out;
}

/**
 * Top-level keys of one object literal keyed by finding type.
 *
 * Bounded to the literal itself — stopping at the first `};` in column
 * zero. Without that it kept reading into whatever followed and picked
 * up unrelated two-space fields from later type declarations, reporting
 * `skipped` as a bogus finding type. A drift test that cries wolf is one
 * people start ignoring.
 */
function keysOf(file: string, startMarker: string): Set<string> {
  const text = src(file);
  const start = text.indexOf(startMarker);
  if (start === -1) throw new Error(`Couldn't find ${startMarker} in ${file}`);
  const rest = text.slice(start);
  const end = rest.search(/^\};/m);
  const body = end === -1 ? rest : rest.slice(0, end);

  const out = new Set<string>();
  for (const m of body.matchAll(/^ {2}([a-z0-9_]+):\s*\{/gm)) {
    out.add(m[1]);
  }
  if (out.size === 0) {
    throw new Error(`Parsed no keys from ${startMarker} in ${file}`);
  }
  return out;
}

const emitted = typesEmittedByCrawler();
const known = new Set<string>([
  ...AUDIT_FINDING_TYPES,
  ...NON_CRAWLER_FINDING_TYPES,
]);

describe("the canonical list matches the crawler", () => {
  it("every type the crawler emits is in AUDIT_FINDING_TYPES", () => {
    const missing = [...emitted].filter(
      (t) => !(AUDIT_FINDING_TYPES as readonly string[]).includes(t),
    );
    expect(
      missing,
      `The crawler emits ${missing.join(", ")}, which isn't in ` +
        `AUDIT_FINDING_TYPES. Add it there in the same commit — otherwise ` +
        `nothing downstream can explain or fix the finding, and no test ` +
        `will notice.`,
    ).toEqual([]);
  });

  it("every type in AUDIT_FINDING_TYPES is actually emitted", () => {
    // A name here that nothing produces is how the other lists went
    // wrong: it reads as covered and never fires.
    const dead = (AUDIT_FINDING_TYPES as readonly string[]).filter(
      (t) => !emitted.has(t),
    );
    expect(
      dead,
      `${dead.join(", ")} is listed but the crawler never emits it. ` +
        `Either the check was removed, or the name is wrong.`,
    ).toEqual([]);
  });
});

describe("the agent can only plan findings that exist", () => {
  it("every FIXABLE key is a real finding type", () => {
    const fixable = keysOf("lib/agent/planner.ts", "const FIXABLE");
    const unreal = [...fixable].filter((t) => !known.has(t));
    expect(
      unreal,
      `The agent is configured to fix ${unreal.join(", ")}, which no ` +
        `audit ever produces — so it can never plan that work on a real ` +
        `site, however complete the executor is. This is exactly how alt ` +
        `text shipped with a capability, an executor branch and an ` +
        `end-to-end test while being unreachable in production.`,
    ).toEqual([]);
  });

  it("the agent covers the findings it claims to", () => {
    // Guards the reverse mistake: renaming a crawler check and silently
    // dropping the agent's ability to fix it.
    const fixable = keysOf("lib/agent/planner.ts", "const FIXABLE");
    expect(fixable.size).toBeGreaterThanOrEqual(7);
  });
});

describe("quick wins point at findings that exist", () => {
  it("every quick-win type is a real finding type", () => {
    const qw = keysOf("lib/quick-wins.ts", "QUICK_WIN_TYPES");
    const unreal = [...qw].filter((t) => !known.has(t));
    expect(
      unreal,
      `Quick wins are configured for ${unreal.join(", ")}, which nothing ` +
        `emits — those quick wins can never appear.`,
    ).toEqual([]);
  });
});

describe("no dead finding names anywhere else", () => {
  // Two more files keyed off finding types. Both happened to list the
  // real name AND the agent's old one, so they worked — but a name that
  // nothing produces reads as coverage and isn't, which is how this
  // whole class of bug stays hidden.
  const OLD_NAMES = [
    "title_too_long",
    "title_too_short",
    "meta_description_too_long",
    "meta_description_too_short",
    "missing_alt_text",
    "multiple_h1",
    "no_sitemap",
    "no_robots",
    "invalid_robots",
    "invalid_sitemap",
  ];

  for (const file of [
    "app/audits/wp-apply-actions.ts",
    "lib/proposal-scope.ts",
    "lib/quick-wins.ts",
    "lib/agent/planner.ts",
    "lib/issue-explainers.ts",
  ]) {
    it(`${file} uses no retired finding names`, () => {
      const text = src(file);
      const found = OLD_NAMES.filter((n) =>
        new RegExp(`["'\`]${n}["'\`]`).test(text),
      );
      expect(
        found,
        `${file} still references ${found.join(", ")}. The crawler never ` +
          `emits those names, so any branch guarded by one is dead code.`,
      ).toEqual([]);
    });
  }
});

describe("guidance reaches the user", () => {
  it("every explainer is keyed to a finding type something produces", () => {
    const explainers = new Set([
      ...Object.keys(ISSUE_EXPLAINERS),
      ...Object.keys(TECH_ISSUE_EXPLAINERS),
    ]);
    const unreal = [...explainers].filter((t) => !known.has(t));
    expect(
      unreal,
      `Explainers exist for ${unreal.join(", ")}, which nothing emits. ` +
        `That guidance was written and can never be displayed. If it ` +
        `belongs to a non-crawler tool, add it to ` +
        `NON_CRAWLER_FINDING_TYPES so this test can tell the difference.`,
    ).toEqual([]);
  });

  it("every finding the crawler emits has an explainer", () => {
    // The user-facing half: a finding with no explainer renders the
    // problem and nothing about what to do with it.
    const explainers = new Set([
      ...Object.keys(ISSUE_EXPLAINERS),
      ...Object.keys(TECH_ISSUE_EXPLAINERS),
    ]);
    const unexplained = (AUDIT_FINDING_TYPES as readonly string[]).filter(
      (t) => !explainers.has(t),
    );
    expect(
      unexplained,
      `${unexplained.length} finding types have no explainer: ` +
        `${unexplained.join(", ")}. Each one shows a user a problem with ` +
        `no guidance on fixing it.`,
    ).toEqual([]);
  });
});

/**
 * The third file of findings, and the difference between a guide
 * existing and a guide being reachable.
 *
 * Two bugs of the same shape were live at once here, and the tests above
 * passed through both:
 *
 *   - lib/ai-site-audit.ts emits 27 ids of its own into the SAME
 *     audit_issues table, so they render through the same component. Not
 *     one had an entry. Users filed #55 and #56 for two of them.
 *   - All twelve TECH_ISSUE_EXPLAINERS were written precisely because
 *     the WordPress findings had no guide — and then never wired into
 *     getExplainer(), so every one stayed unreachable.
 *
 * The second is the instructive one. The test above asserts the guide
 * EXISTS, by reading the object. Nothing asserted a user could reach it.
 * So these go through getExplainer() — the only path to a screen — and
 * the earlier `FINDING_SOURCES` blind spot is now a third entry rather
 * than a third silent gap.
 */
const AI_AUDIT_SOURCE = "lib/ai-site-audit.ts";

function typesEmittedByAiAudit(): Set<string> {
  const out = new Set<string>();
  for (const m of src(AI_AUDIT_SOURCE).matchAll(/^\s{4,}id:\s*"([a-z0-9_]+)"/gm)) {
    out.add(m[1]);
  }
  return out;
}

/**
 * AI checks with no hand-written guide, on purpose.
 *
 * Each is either a length-range check where we hold two opposed guides
 * (long_/short_) and picking one would mislead half the readers, or a
 * check nothing generic covers. They fall through to the per-page fix
 * steps the AI wrote, which IssueExplainer renders behind a "written by
 * the AI, check it" label.
 *
 * Shrinking this list is the improvement. Growing it needs a reason.
 */
const AI_TYPES_ON_AI_STEPS = [
  "title",
  "meta_description",
  "internal_links",
  "external_citations",
  "eeat_dates",
  "eeat_authoritative",
  "mobile_no_interstitial",
  "perf_score",
];

describe("the AI site audit's findings reach guidance too", () => {
  it("emits the ids we think it does", () => {
    // Guards the guard: a regex that matched nothing would make every
    // assertion below pass against an empty set.
    const ids = typesEmittedByAiAudit();
    expect(ids.size).toBeGreaterThanOrEqual(25);
    expect(ids.has("eeat_byline")).toBe(true);
    expect(ids.has("perf_lcp")).toBe(true);
  });

  it("every AI check either resolves to a guide or is a known fallback", () => {
    const ids = [...typesEmittedByAiAudit()];
    const stranded = ids.filter(
      (id) => !getExplainer(id) && !AI_TYPES_ON_AI_STEPS.includes(id),
    );
    expect(
      stranded,
      `${stranded.join(", ")} shows a user a failing check with no guide ` +
        `and no entry in AI_TYPES_ON_AI_STEPS. Either alias it to the ` +
        `guide that already covers it, write one, or add it to that list ` +
        `with a reason.`,
    ).toEqual([]);
  });

  it("every alias points at a guide that exists", () => {
    const broken = Object.entries(AI_AUDIT_EXPLAINER_ALIASES).filter(
      ([, target]) => !ISSUE_EXPLAINERS[target],
    );
    expect(
      broken.map(([k, v]) => `${k} -> ${v}`),
      `An alias naming a guide that does not exist resolves to null, ` +
        `which looks exactly like having no alias at all.`,
    ).toEqual([]);
  });

  it("the fallback list names only ids the AI audit actually emits", () => {
    const ids = typesEmittedByAiAudit();
    const dead = AI_TYPES_ON_AI_STEPS.filter((t) => !ids.has(t));
    expect(
      dead,
      `${dead.join(", ")} is excused from needing a guide but nothing ` +
        `emits it — so the excuse covers nothing and reads as coverage.`,
    ).toEqual([]);
  });
});

describe("written guidance is reachable, not just present", () => {
  it("every tech explainer can be reached through getExplainer", () => {
    // The whole file was unreachable: getExplainer read only
    // ISSUE_EXPLAINERS, so twelve WordPress guides sat in the repo while
    // every wp_* finding said none had been written.
    const unreachable = Object.keys(TECH_ISSUE_EXPLAINERS).filter(
      (t) => !getExplainer(t),
    );
    expect(
      unreachable,
      `${unreachable.join(", ")} exist in TECH_ISSUE_EXPLAINERS but ` +
        `getExplainer() returns null for them, so no screen can show ` +
        `them. Writing the guide is only half of shipping it.`,
    ).toEqual([]);
  });

  it("every generic explainer can be reached through getExplainer", () => {
    const unreachable = Object.keys(ISSUE_EXPLAINERS).filter(
      (t) => !getExplainer(t),
    );
    expect(unreachable).toEqual([]);
  });

  it("the audit page still passes the AI fix-steps fallback", () => {
    // Without this prop the eight AI_TYPES_ON_AI_STEPS checks go back to
    // "we haven't written the fix guide", which is what #55 and #56
    // were. A prop is easy to drop in a refactor and nothing else here
    // would notice.
    const page = src("app/audits/[id]/page.tsx");
    expect(page).toMatch(/fallbackSteps=\{g\.fixSteps\}/);
  });
});
