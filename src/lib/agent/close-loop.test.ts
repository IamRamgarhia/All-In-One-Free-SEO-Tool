/**
 * The loop-closing step, and above all the branches that must NOT close
 * a finding.
 *
 * Resolving a finding is a claim about a live website, repeated to the
 * user in three places — the audit score, the task list and the monthly
 * report. There are exactly three ways to get it wrong, and two of them
 * look like success:
 *
 *   1. resolve because the CMS accepted the write    (cache still serving
 *                                                     the old title)
 *   2. resolve because the page would not load       (no evidence at all)
 *   3. resolve an action that was never applied      (straight falsehood)
 *
 * Each is silent. The audit score improves, the task closes, the report
 * says fixed, and Google sees the old page. So these tests are mostly
 * about refusing, which is the behaviour the module exists for.
 *
 * The database paths are exercised against a real SQLite file by the
 * agent's own integration checks; what is unit-tested here is the
 * decision logic and the mapping that decides which finding an action is
 * allowed to close — the part where a wrong entry silently resolves the
 * wrong thing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_FINDING_TYPES } from "@/lib/audit-finding-types";
import { ISSUE_TYPES_FOR_KIND } from "./close-loop";

const SRC = readFileSync(
  join(process.cwd(), "src/lib/agent/close-loop.ts"),
  "utf8",
);

describe("the kind → finding-type map cannot resolve what it did not fix", () => {
  /**
   * The real exported map, not a regex over the source.
   *
   * This did parse the source, and broke the moment the declaration's
   * annotation changed from `Record<string, string[]>` to
   * `Record<string, AuditFindingType[]>` — four tests failing with
   * "ISSUE_TYPES_FOR_KIND not found". A guard that can fail because it
   * cannot locate its subject could equally have PASSED while finding
   * nothing, which is the worse direction. Importing the value removes
   * the question.
   */
  const mapping = (): Record<string, string[]> => ISSUE_TYPES_FOR_KIND;

  it("every mapped type is a finding type the crawler actually emits", () => {
    /*
     * THE TEST THAT WAS MISSING, and the reason this file is not just
     * source-reading.
     *
     * The first version of the map used "title_too_long",
     * "meta_description_too_long", "image_missing_alt" and
     * "robots_blocks_everything" — four plausible names, none of which
     * the crawler has ever emitted. It emits long_title,
     * long_meta_description, missing_image_alt, invalid_robots_txt.
     *
     * So the "is the problem still on the live page?" comparison tested
     * the finding's type against a string no finding can have,
     * `stillThere` was always false, and every applied action resolved
     * its finding whatever the page served. The single branch written to
     * stop this tool lying was the one doing the lying — and it
     * typechecked and passed every other test in this file.
     *
     * Checked against the real list rather than by trusting the
     * TypeScript union, because a union is one careless `as string` away
     * from accepting anything.
     */
    const real = new Set<string>(AUDIT_FINDING_TYPES as readonly string[]);
    expect(real.size).toBeGreaterThan(50);
    const bogus: string[] = [];
    for (const [kind, types] of Object.entries(mapping())) {
      for (const t of types) if (!real.has(t)) bogus.push(`${kind} → ${t}`);
    }
    expect(
      bogus,
      `These finding types do not exist, so the "still present on the live ` +
        `page" check can never match and the finding resolves whatever the ` +
        `page serves:\n  ${bogus.join("\n  ")}`,
    ).toEqual([]);
  });

  it("maps every kind it claims to, and none to nothing", () => {
    const map = mapping();
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(5);
    for (const [kind, types] of Object.entries(map)) {
      expect(types.length, `${kind} maps to no finding type`).toBeGreaterThan(0);
      for (const t of types) expect(t).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("never maps one finding type to two different kinds", () => {
    // Two kinds claiming the same finding means whichever ran last
    // resolves it, including one that did not touch the thing the
    // finding is about.
    const map = mapping();
    const owner = new Map<string, string>();
    for (const [kind, types] of Object.entries(map)) {
      for (const t of types) {
        expect(
          owner.has(t),
          `${t} is claimed by both ${owner.get(t)} and ${kind}`,
        ).toBe(false);
        owner.set(t, kind);
      }
    }
  });

  it("only maps kinds whose effect is visible in fetched HTML", () => {
    // The recheck is a plain GET plus checkPage. A kind whose result is
    // not in the HTML — a plugin install, a file write, a redirect rule
    // — cannot be confirmed this way, and listing it would resolve a
    // finding on no evidence.
    const map = mapping();
    const notCheckable = [
      "install_plugin",
      "write_file",
      "add_redirect",
      "deactivate_plugin",
      "convert_image",
    ];
    for (const kind of notCheckable) {
      expect(
        map[kind],
        `${kind} is mapped, but its effect is not visible in fetched HTML`,
      ).toBeUndefined();
    }
  });
});

describe("the refusals are all present in the code", () => {
  it("refuses to confirm an action that was not applied", () => {
    expect(SRC).toContain('action.status !== "verified" && action.status !== "applied"');
    expect(SRC).toContain('result: "not_applied"');
  });

  it("refuses to confirm when the page could not be fetched", () => {
    // The most tempting branch to get wrong: recheckUrl returning null
    // means "no evidence", and `findings.some(...)` on a null would
    // throw, so the only safe handling is an explicit early return.
    expect(SRC).toContain('result: "unreachable"');
    expect(SRC).toMatch(/if \(!recheck\)/);
    // And it must say so rather than swallow it.
    expect(SRC).toContain("Leaving the finding open");
  });

  it("refuses to confirm while the finding is still in the live HTML", () => {
    expect(SRC).toContain('result: "still_present"');
    // The cause is nearly always the user's cache, so the message has to
    // name it or this reads as a bug in the tool.
    expect(SRC.toLowerCase()).toContain("cache");
  });

  it("the resolve only happens after the recheck, not after the CMS read-back", () => {
    // Order matters and is the entire point. The update to `resolved`
    // must appear AFTER the stillThere branch returns.
    const stillThere = SRC.indexOf('result: "still_present"');
    const resolve = SRC.indexOf('.set({ status: "resolved"');
    expect(stillThere).toBeGreaterThan(0);
    expect(resolve).toBeGreaterThan(0);
    expect(
      resolve,
      "the finding is resolved before the still-present check returns",
    ).toBeGreaterThan(stillThere);
  });

  it("is idempotent for an already-resolved finding", () => {
    // closeLoopForRun re-reads every applied action in the run, and a
    // run can be re-examined. Logging "confirmed fixed" twice would put
    // two entries in the client's activity log for one change.
    expect(SRC).toContain('issue.status === "resolved"');
    expect(SRC).toContain("Already confirmed fixed");
  });
});

describe("closing tasks is driven by the findings, not by a guess", () => {
  it("only closes an agent task when no open finding of its type remains", () => {
    expect(SRC).toContain('eq(auditIssues.status, "new")');
    expect(SRC).toContain("if (remaining.length > 0) continue;");
  });

  it("parses the task's own sourceRef rather than matching on its title", () => {
    // Titles are human copy and get rewritten; sourceRef is the
    // identifier the task was created with.
    expect(SRC).toContain('t.sourceRef?.startsWith("agent:")');
  });
});

describe("the run actually calls it", () => {
  const RUN = readFileSync(join(process.cwd(), "src/lib/agent/run.ts"), "utf8");

  it("closeLoopForRun runs in the agent run", () => {
    // Without this the module is dead code and the measured symptom —
    // 115 tasks open, none ever completed — stays exactly as it was.
    expect(RUN).toContain("closeLoopForRun");
  });

  it("runs before task creation, so confirmed work is not re-raised", () => {
    const loop = RUN.indexOf("await closeLoopForRun(");
    const tasks = RUN.indexOf("await createTasksFromUnfixable(");
    expect(loop).toBeGreaterThan(0);
    expect(tasks).toBeGreaterThan(0);
    expect(loop).toBeLessThan(tasks);
  });

  it("the run summary reports confirmation separately from application", () => {
    // "Fixed 3 things" was true of the CMS and not necessarily of the
    // page a crawler fetches. The two claims must not be merged back.
    expect(RUN).toContain("confirmed");
    expect(RUN).toContain("still showing on the live page");
  });
});

describe("the planner no longer re-queues work already queued", () => {
  const PLANNER = readFileSync(
    join(process.cwd(), "src/lib/agent/planner.ts"),
    "utf8",
  );

  it("filters against currently queued actions with no time window", () => {
    // The cooldown is 7 days and the measured duplicates were 12 days
    // apart, which is why a time-boxed filter could not catch them.
    expect(PLANNER).toContain("filterAlreadyQueued");
    const fn = PLANNER.slice(
      PLANNER.indexOf("async function filterAlreadyQueued"),
      PLANNER.indexOf("function actionKey"),
    );
    expect(fn).toContain('eq(agentActions.status, "queued")');
    expect(fn, "the queued filter must not be time-boxed").not.toContain("cutoff");
  });

  it("the filtered list is what gets used, not the pre-filter one", () => {
    // The first version computed notPending, reported a count in the
    // skip notes, and then kept slicing `cooled` — so it ran and changed
    // nothing.
    expect(PLANNER).toContain("notPending.sort(");
    expect(PLANNER).toContain("notPending.slice(0, limit)");
  });

  it("both filters agree on what 'the same change' means", () => {
    // Two definitions of identity would let a change be deduped by one
    // filter and not the other.
    const keyFns = PLANNER.match(/function actionKey\(/g) ?? [];
    expect(keyFns.length).toBe(1);
    expect(PLANNER).not.toMatch(/const key = \(kind: string/);
  });
});

// ── Added in this fork ──────────────────────────────────────────────────

import { readRecheck, sameUrl } from "./close-loop";
import { isPageRecheckable, type RecheckResult } from "@/lib/audit";

describe("only findings a single page can confirm are closed this way", () => {
  it("no cross-page or site-wide type is in the map", () => {
    // duplicate_title was in the original map: re-fetching one page never
    // produces it, so it always looked gone and resolved on no evidence.
    for (const [kind, types] of Object.entries(ISSUE_TYPES_FOR_KIND)) {
      for (const t of types) expect(isPageRecheckable(t), `${kind} → ${t}`).toBe(true);
    }
    const all = Object.values(ISSUE_TYPES_FOR_KIND).flat();
    expect(all).not.toContain("duplicate_title");
    expect(all).not.toContain("duplicate_meta_description");
    expect(all).toContain("long_title");
  });
});

describe("reading a re-fetch never claims more than it saw", () => {
  const page = "https://example.com/a";
  const base = (over: Partial<RecheckResult> = {}): RecheckResult => ({
    findings: [],
    meta: { title: null, description: null },
    status: 200,
    finalUrl: page,
    techChecked: true,
    ...over,
  });

  it("no answer is not a fix", () => {
    expect(readRecheck(null, "long_title", page)).toBe("unreachable");
  });

  it("still there is still there, whatever the trailing slash", () => {
    const r = base({ findings: [{ type: "long_title", severity: "low", url: `${page}/`, message: "" }] });
    expect(readRecheck(r, "long_title", page)).toBe("present");
  });

  it("an error page has no title to be too long", () => {
    expect(readRecheck(base({ status: 404 }), "long_title", page)).toBe("error_page");
    // …but a status finding is exactly what an error page can answer.
    expect(readRecheck(base({ status: 200 }), "bad_status", page)).toBe("gone");
  });

  it("a redirect to another page checked another page", () => {
    expect(readRecheck(base({ finalUrl: "https://example.com/b" }), "long_title", page)).toBe("moved");
  });

  it("a site-wide finding cannot be confirmed on one page", () => {
    expect(readRecheck(base(), "missing_sitemap", page)).toBe("unchecked");
    expect(readRecheck(base(), "duplicate_title", page)).toBe("unchecked");
    expect(readRecheck(base(), "seomator:core-title-length", page)).toBe("unchecked");
  });

  it("a technology check that did not run proves nothing", () => {
    expect(readRecheck(base({ techChecked: false }), "next_raw_img_tags", page)).toBe("unchecked");
    expect(readRecheck(base({ techChecked: true }), "next_raw_img_tags", page)).toBe("gone");
  });

  it("gone only when the page was served, at that address, without it", () => {
    expect(readRecheck(base(), "long_title", page)).toBe("gone");
    expect(sameUrl("http://Example.com/a/", page)).toBe(true);
  });
});
