/**
 * Guards the install-health report.
 *
 * Ported from upstream, where this module exists because five real
 * problems sat unreported for weeks on the maintainer's own install. The irony to protect against is
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
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import {
  HEALTH_ISSUE_KINDS,
  diagnoseGscProperties,
  sortIssues,
  summariseHealth,
  worstSeverity,
  type HealthIssue,
  type HealthSeverity,
} from "./install-health";
import { issueText, type LooseT } from "./install-health-text";

const issue = (id: string, severity: HealthSeverity): HealthIssue => ({
  id,
  severity,
  kind: "check_failed",
  params: { check: id },
  fixHref: "/settings/health",
});

/** The sentences a surface would show, in one language. */
function words(locale: "en" | "fr", i: HealthIssue) {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : fr,
    namespace: "installHealth",
  }) as unknown as LooseT;
  return issueText(i, t, {
    toolName: (id) => id,
    formatDate: (iso) => iso.slice(0, 10),
    listFormat: (items) => items.join(", "),
  });
}

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
    expect(s).toEqual({ broken: 2, stalled: 1 });
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

  it("counts stalled without broken", () => {
    expect(
      summariseHealth({
        issues: [issue("a", "stalled"), issue("b", "idle")],
        checkedAt: new Date(),
        neverChecked: false,
      }),
    ).toEqual({ broken: 0, stalled: 1 });
  });
});

describe("the report reaches somewhere people look", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the dashboard renders the banner", () => {
    // The weeks upstream are the evidence for this assertion. The data existed
    // in agent run summaries and on /settings/health the whole time; a
    // settings sub-page is not where anybody checks whether their tool
    // is working.
    const page = read("src/app/page.tsx");
    expect(page).toContain("InstallHealthBanner");
    // Owners and managers only: a member or a client viewer sees only
    // some clients, and the banner names every client.
    expect(page).toMatch(/!scoped && \(\s*(?:<>\s*)?<Suspense fallback=\{null\}>\s*<InstallHealthBanner/);
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

  it("Settings → System health shows the full list", () => {
    expect(read("src/app/settings/health/page.tsx")).toContain("<InstallHealthSection />");
  });

  it("the banner hides idle issues and says when it last checked", () => {
    const banner = read("src/app/install-health-banner.tsx");
    expect(banner).toContain('severity !== "idle"');
    expect(banner).toContain("neverChecked");
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

describe("partial failure must not read as success", () => {
  const SRC = readFileSync(
    join(process.cwd(), "src/lib/install-health.ts"),
    "utf8",
  );

  it("the rank check measures COVERAGE, not whether any row exists", () => {
    /*
     * The bug this guards, in this module's own code.
     *
     * The first version counted rows in the window and returned early if
     * ANY existed. Measured on the maintainer's install: 24 keywords
     * tracked, 16 with a recent reading, and EIGHT never checked at all —
     * and the check said nothing, because one success suppressed it. A
     * single working keyword would have hidden twenty-three broken ones.
     *
     * Exactly the silent-wrong-answer shape this module was built to
     * catch, inside the catcher.
     */
    const fn = SRC.slice(
      SRC.indexOf("async function checkRankData"),
      SRC.indexOf("async function checkClientsNeverAudited"),
    );
    expect(fn).toContain("selectDistinct");
    // The early return must depend on a percentage and on the
    // never-checked count, not on a row existing.
    expect(fn).toMatch(/pct >= \d+ && neverChecked === 0/);
    expect(fn).not.toMatch(/Number\(recent\?\.n \?\? 0\) > 0\) return \[\]/);
  });

  it("it names how many of how many, so the number can be checked", () => {
    const partial: HealthIssue = {
      id: "rank_coverage_low",
      severity: "stalled",
      kind: "rank_partial",
      params: { current: 16, tracked: 24, pct: 67, never: 8, days: 14 },
      fixHref: "/settings/serp",
    };
    const e = words("en", partial);
    expect(e.title).toBe("Only 16 of 24 tracked keywords have a recent position");
    expect(e.evidence).toContain("8 keywords have never been checked");
    const f = words("fr", partial);
    expect(f.title).toBe("Seuls 16 mots-clés suivis sur 24 ont une position récente");
    expect(f.evidence).toContain("8 mots-clés n’ont jamais été vérifiés");
    // A list with nothing never-checked does not grow a dangling clause.
    const none = words("en", { ...partial, params: { ...partial.params, never: 0 } });
    expect(none.evidence).not.toContain("never been checked");
  });

  it("sends people to the existing source settings, without naming a source", () => {
    // Which source answers is someone else's business (Settings → Google
    // results); this report measures coverage and says nothing more.
    expect(SRC).toContain('fixHref: "/settings/serp"');
    for (const kind of ["rank_none", "rank_partial"] as const) {
      for (const messages of [en, fr]) {
        const text = JSON.stringify(
          (messages as { installHealth: { issues: Record<string, unknown> } }).installHealth.issues[kind],
        );
        expect(text).not.toMatch(/searxng|brave|serper|dataforseo|captcha/i);
      }
    }
  });
});

describe("evidence is specific enough to act on", () => {
  it("every kind has a title, an evidence line and a fix, in both languages", () => {
    // The difference between this banner and the warning everybody
    // ignores is that it says what was observed. A kind with no evidence
    // line would render a bare title.
    for (const messages of [en, fr]) {
      const issues = (messages as { installHealth: { issues: Record<string, Record<string, string>> } })
        .installHealth.issues;
      for (const kind of HEALTH_ISSUE_KINDS) {
        expect(issues[kind]?.title, `${kind}.title`).toBeTruthy();
        expect(issues[kind]?.evidence, `${kind}.evidence`).toBeTruthy();
        expect(issues[kind]?.fix, `${kind}.fix`).toBeTruthy();
      }
    }
  });

  it("keeps the outside world's answer verbatim", () => {
    const wp: HealthIssue = {
      id: "wp_unreachable_1",
      severity: "broken",
      kind: "wp_unreachable",
      params: { client: "Acme", endpoint: "https://acme.example/wp-json/seo-tool/v1" },
      detail: '{"code":"rest_no_route"}',
      fixHref: "/clients/1?tab=settings",
    };
    expect(words("en", wp).detail).toContain("rest_no_route");
    expect(words("fr", wp).detail).toContain("rest_no_route");
    expect(words("fr", wp).title).toBe("Acme\u00a0: l’extension WordPress ne répond pas");
  });

  it("an unreachable site names the cause in the reader's language", () => {
    const sweep: HealthIssue = {
      id: "sweep_failing_3",
      severity: "stalled",
      kind: "sweep_unreachable",
      params: { client: "Acme", count: 9 },
      tools: ["headers", "hreflang"],
      networkKind: "dns",
      fixHref: "/clients/3?tab=settings",
    };
    expect(words("en", sweep).evidence).toContain("the address does not resolve");
    expect(words("fr", sweep).evidence).toContain("l’adresse ne se résout pas");
    expect(words("fr", sweep).evidence).toContain("headers, hreflang");
  });

  it("failing nightly jobs are named, not counted", () => {
    const nightly: HealthIssue = {
      id: "nightly_jobs_failing",
      severity: "stalled",
      kind: "nightly_jobs_failing",
      params: { failed: 2, total: 20, date: "2026-11-24T03:00:00.000Z" },
      jobs: ["rank.weekly_sweep", "sitemap.health"],
      fixHref: "/settings/health#nightly-jobs",
    };
    expect(words("fr", nightly).title).toBe("2 tâches nocturnes sur 20 ont échoué");
    expect(words("fr", nightly).evidence).toContain("2026-11-24");
    expect(words("fr", nightly).evidence).toContain("rank.weekly_sweep, sitemap.health");
    expect(words("en", nightly).title).toBe("2 of 20 nightly jobs failed");
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

describe("Search Console properties the account cannot read", () => {
  const rows = [
    { id: 1, name: "Acme", gscProperty: "https://www.acme.example/" },
    { id: 2, name: "Beta", gscProperty: null },
    { id: 3, name: "Gamma", gscProperty: "sc-domain:gamma.example" },
  ];

  it("a client with no property set is not a fault", () => {
    const out = diagnoseGscProperties(rows, [{ siteUrl: "https://www.acme.example/" }]);
    expect(out.map((i) => i.clientId)).toEqual([3]);
  });

  it("offers the spelling the account does hold for the same site", () => {
    const out = diagnoseGscProperties(rows, [
      { siteUrl: "sc-domain:acme.example" },
      { siteUrl: "sc-domain:gamma.example" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("gsc_other_property");
    expect(out[0].params.suggestion).toBe("sc-domain:acme.example");
  });

  it("an account with no property at all says so", () => {
    const out = diagnoseGscProperties(rows, []);
    expect(out.map((i) => i.kind)).toEqual(["gsc_account_empty", "gsc_account_empty"]);
  });

  it("a property simply absent from the account is told apart", () => {
    const out = diagnoseGscProperties(rows, [{ siteUrl: "https://other.example/" }]);
    expect(out.every((i) => i.kind === "gsc_not_in_account")).toBe(true);
  });
});
