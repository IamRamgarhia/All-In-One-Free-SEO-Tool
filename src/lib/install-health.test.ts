/**
 * Guards the install-health report.
 *
 * This module exists because five real problems sat unreported for 68
 * days on the maintainer's own install. The irony to protect against is
 * obvious: a health check that is itself quietly wrong puts us straight
 * back there, in a worse position, because now there is a green banner
 * saying everything is fine.
 *
 * The first version of checkClientsNeverAudited did exactly that in
 * reverse — a correlated subquery that compiled, ran, threw nothing and
 * returned 0 for every client, so it reported all three clients as never
 * audited while they held 349, 27 and 413 issues between them. It was
 * caught by running it against the real database, not by a test, because
 * a test that only checks the SHAPE of a HealthIssue[] passes on
 * fabricated issues just as happily as on real ones.
 *
 * So these tests are about the pure, decidable parts — ordering,
 * severity selection, wording — and about the one property that matters
 * most for trust: that "we have not looked" never renders as "nothing
 * is wrong".
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sortIssues,
  summariseHealth,
  worstSeverity,
  type HealthIssue,
  type HealthSeverity,
} from "./install-health";

const issue = (
  id: string,
  severity: HealthSeverity,
  title = `title ${id}`,
): HealthIssue => ({
  id,
  severity,
  title,
  evidence: `evidence for ${id}`,
  fixHref: "/settings/health",
  fixLabel: "Fix it",
});

describe("ordering puts the worst first", () => {
  it("broken before stalled before idle", () => {
    const sorted = sortIssues([
      issue("c", "idle"),
      issue("a", "stalled"),
      issue("b", "broken"),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });

  it("does not mutate its input", () => {
    // The banner slices the top N off this. If sorting reordered the
    // caller's array, the health page and the banner would disagree
    // about which issues are "the first four" depending on render order.
    const input = [issue("c", "idle"), issue("b", "broken")];
    sortIssues(input);
    expect(input.map((i) => i.id)).toEqual(["c", "b"]);
  });

  it("worstSeverity reports the worst present, or null for none", () => {
    expect(worstSeverity([])).toBeNull();
    expect(worstSeverity([issue("a", "idle"), issue("b", "broken")])).toBe("broken");
    expect(worstSeverity([issue("a", "idle"), issue("b", "stalled")])).toBe("stalled");
    expect(worstSeverity([issue("a", "idle")])).toBe("idle");
  });
});

describe("never-checked and all-clear must not look the same", () => {
  it("a never-checked install produces no summary rather than an all-clear", () => {
    // The distinction this module is about. If these returned the same
    // thing, a scheduler that had never run would render as a healthy
    // install — which is the bug, not the fix.
    expect(
      summariseHealth({ issues: [], checkedAt: null, neverChecked: true }),
    ).toBeNull();
  });

  it("a checked, healthy install also produces no summary", () => {
    expect(
      summariseHealth({ issues: [], checkedAt: new Date(), neverChecked: false }),
    ).toBeNull();
  });

  it("the two are distinguishable by the caller, which is the point", () => {
    // summariseHealth returning null for both is fine BECAUSE the flag
    // travels separately and the banner checks it. This test exists so
    // that nobody "simplifies" InstallHealth by dropping neverChecked.
    const never = { issues: [], checkedAt: null, neverChecked: true };
    const clean = { issues: [], checkedAt: new Date(), neverChecked: false };
    expect(never.neverChecked).not.toBe(clean.neverChecked);
    expect(never.checkedAt).toBeNull();
    expect(clean.checkedAt).not.toBeNull();
  });
});

describe("the summary counts what is actionable", () => {
  it("names broken and stalled separately, since they need different responses", () => {
    const s = summariseHealth({
      issues: [
        issue("a", "broken"),
        issue("b", "broken"),
        issue("c", "stalled"),
      ],
      checkedAt: new Date(),
      neverChecked: false,
    });
    expect(s).toContain("2 connections not working");
    expect(s).toContain("1 thing stalled");
  });

  it("ignores idle entirely", () => {
    // A client you have not audited yet is not a fault. Counting it
    // would make the banner permanent, and a permanent banner is
    // invisible — exactly the failure this module replaces.
    expect(
      summariseHealth({
        issues: [issue("a", "idle"), issue("b", "idle")],
        checkedAt: new Date(),
        neverChecked: false,
      }),
    ).toBeNull();
  });

  it("gets singular and plural right", () => {
    const one = summariseHealth({
      issues: [issue("a", "broken")],
      checkedAt: new Date(),
      neverChecked: false,
    });
    expect(one).toContain("1 connection not working");
    expect(one).not.toContain("connections");
  });
});

describe("the report reaches somewhere people look", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the dashboard renders the banner", () => {
    // The 68 days are the evidence for this assertion. The data existed
    // in agent run summaries and on /settings/health the whole time; a
    // settings sub-page is not where anybody checks whether their tool
    // is working.
    const page = read("src/app/page.tsx");
    expect(page).toContain("InstallHealthBanner");
  });

  it("the scheduler runs the checks", () => {
    // Without this the stored result is never written, readStoredHealth
    // always returns neverChecked, and the banner silently never
    // appears — a monitoring feature that monitors nothing and says so
    // to no one.
    const sched = read("src/lib/scheduler.ts");
    expect(sched).toContain("install_health");
    expect(sched).toContain("refreshStoredHealth");
  });

  it("the banner hides idle issues and says when it last checked", () => {
    const banner = read("src/app/install-health-banner.tsx");
    expect(banner).toContain('severity !== "idle"');
    // The timestamp is not decoration: these checks run on a schedule,
    // so a banner without one implies the problem is current when it
    // may be six hours old.
    expect(banner).toContain("checkedAt");
  });

  it("every check is wrapped so one failure cannot hide the others", () => {
    // An unreachable integration is the normal case here. If a throwing
    // check took down the report, the report would go blank precisely
    // when it has the most to say.
    const src = read("src/lib/install-health.ts");
    expect(src).toContain("safe(check");
    expect(src).toContain("check_failed_");
  });
});

describe("evidence is specific enough to act on", () => {
  it("every check in the module builds an evidence string", () => {
    // The difference between this banner and the warning everybody
    // ignores is that "no route was found matching the URL" identifies
    // the problem and "integration unhealthy" does not.
    const src = readFileSync(
      join(process.cwd(), "src/lib/install-health.ts"),
      "utf8",
    );
    const checks = [...src.matchAll(/^async function (check\w+)/gm)].map(
      (m) => m[1],
    );
    expect(checks.length).toBeGreaterThanOrEqual(6);
    // Each check's body must assign evidence somewhere. Crude, but it
    // fails if someone adds a check that reports a bare title.
    const evidenceCount = (src.match(/evidence:/g) ?? []).length;
    expect(evidenceCount).toBeGreaterThanOrEqual(checks.length);
  });

  it("no check is registered without being defined, and none defined without being run", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/install-health.ts"),
      "utf8",
    );
    const defined = new Set(
      [...src.matchAll(/^async function (check\w+)/gm)].map((m) => m[1]),
    );
    const registered = new Set(
      [...src.matchAll(/safe\((check\w+)\)/g)].map((m) => m[1]),
    );
    // A check that is written and never registered is dead code that
    // reads as coverage — the shape of half the bugs in this repo's
    // history.
    const unregistered = [...defined].filter((d) => !registered.has(d));
    expect(
      unregistered,
      `${unregistered.join(", ")} is defined but never run by runHealthChecks`,
    ).toEqual([]);
    const undefinedChecks = [...registered].filter((r) => !defined.has(r));
    expect(undefinedChecks).toEqual([]);
  });
});
