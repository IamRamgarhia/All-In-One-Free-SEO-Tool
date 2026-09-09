/**
 * Findings for the checks whose results live in shared libs.
 *
 * Several tools are thin server actions over a library that does the
 * real work — the WordPress hack scanner, the facet-trap crawler, the
 * mobile-friendliness inspector. Their finding builders live here rather
 * than in each action file, because the shape they read from is the
 * library's, and putting the two next to each other is how the two stay
 * in step.
 *
 * The rule every builder follows: a signature must be stable across
 * runs. Counts, URLs and scores all change between runs, so a signature
 * built from one produces a fresh finding every time and nothing can
 * ever be marked resolved. Put the changing part in the title and the
 * details, and keep the signature about the KIND of problem.
 */

import type { FindingDraft } from "./tool-findings";
import type { HackScanReport } from "./wp-hack-scanner";
import type { FacetTrapReport } from "./facet-trap";
import type { MobileFriendlyCheck } from "./page-inspectors";

/**
 * A compromised WordPress site.
 *
 * One finding per indicator category, not per indicator: twenty
 * injected scripts from one backdoor are one break-in, and listing them
 * separately turns a single incident into twenty things to close.
 *
 * Not mapped for the agent, and it never should be. Cleaning a hacked
 * site means taking it offline, rotating credentials and restoring from
 * a known-good backup. An automated content edit on a compromised site
 * is at best pointless and at worst destroys evidence.
 */
export function wpHackFindings(report: HackScanReport): FindingDraft[] {
  if (report.iocs.length === 0) return [];

  const byCategory = new Map<string, typeof report.iocs>();
  for (const ioc of report.iocs) {
    const list = byCategory.get(ioc.category);
    if (list) list.push(ioc);
    else byCategory.set(ioc.category, [ioc]);
  }

  const LABEL: Record<string, string> = {
    backdoor: "Possible backdoor files",
    injection: "Injected code in the page",
    spam: "Spam content served to visitors",
    cloaking: "Different content served to crawlers",
    exposure: "Files exposed that should not be public",
    config: "Configuration left insecure",
    version: "Outdated software with known vulnerabilities",
  };

  return [...byCategory.entries()].map(([category, list]) => ({
    signature: `wp-hack-scan.${category}`,
    title: `${LABEL[category] ?? category} — ${list.length} indicator${list.length === 1 ? "" : "s"}`,
    severity: worst(list.map((i) => i.severity)),
    category: "security",
    details:
      list
        .slice(0, 4)
        .map((i) => `${i.title}: ${i.detail}`)
        .join(" | ") +
      (list.length > 4 ? ` and ${list.length - 4} more.` : "") +
      ` Overall risk: ${report.riskLevel}.`,
  }));
}

/**
 * Faceted navigation generating more URLs than the site has pages.
 *
 * Only the groups that actually risk a crawl trap. A shape with three
 * variants is a normal filter; one with thousands is a site spending its
 * crawl budget on combinations nobody searches for.
 */
export function facetTrapFindings(report: FacetTrapReport): FindingDraft[] {
  const risky = report.groups.filter(
    (g) => g.hasFilterParams && g.count >= 20,
  );
  if (risky.length === 0) return [];

  return [
    {
      signature: "facet-trap.crawlable_facets",
      title: `${report.facetUrlCount} filter URLs across ${risky.length} pattern${risky.length === 1 ? "" : "s"}`,
      // The tool has already judged this across every group, and its
      // answer is better than re-deriving one from the counts here.
      severity:
        report.overall === "high"
          ? "high"
          : report.overall === "medium"
            ? "medium"
            : "low",
      category: "crawl-budget",
      details:
        `${report.summary} Worst patterns: ` +
        risky
          .slice(0, 3)
          .map((g) => `${g.shape} (${g.count} URLs)`)
          .join(", ") +
        ". Each one is a page Google can crawl instead of a page you wrote.",
    },
  ];
}

/**
 * Mobile problems a page has before anyone renders it.
 *
 * Deliberately narrow. This inspector reads the HTML rather than
 * rendering the page, so it can be certain about a missing or broken
 * viewport and only guess about tap targets and font sizes. Reporting a
 * guess with the same confidence as a fact is how a checker stops being
 * believed, so only the certain ones become findings.
 */
export function mobileFindings(check: MobileFriendlyCheck): FindingDraft[] {
  const out: FindingDraft[] = [];

  if (!check.hasViewport) {
    out.push({
      signature: "mobile-friendly.no_viewport",
      title: "No viewport meta tag",
      // Without one a phone renders the page at desktop width and scales
      // it down, which is the difference between a usable page and an
      // unreadable one.
      severity: "high",
      category: "mobile",
      details:
        "Phones fall back to a desktop-width layout scaled down to fit, so text arrives " +
        "too small to read and nothing is tappable. Google has indexed mobile-first since " +
        "2019, so this is the version it judges.",
    });
  } else if (!check.viewportSane) {
    out.push({
      signature: "mobile-friendly.bad_viewport",
      title: "Viewport is set but not for mobile",
      severity: "medium",
      category: "mobile",
      details:
        `The tag reads "${check.viewport ?? ""}". Without width=device-width the page is ` +
        "laid out at a fixed width and then scaled, which is most of the way to having no " +
        "viewport at all.",
    });
  }

  if (!check.hasCharset) {
    out.push({
      signature: "mobile-friendly.no_charset",
      title: "Page declares no character set",
      severity: "low",
      category: "mobile",
      details:
        "Without a charset the browser guesses, and guesses wrong on any page with " +
        "punctuation from outside ASCII — the classic mangled apostrophe.",
    });
  }

  return out;
}

/** The highest severity present, defaulting to low. */
function worst(
  severities: readonly string[],
): FindingDraft["severity"] {
  for (const s of ["critical", "high", "medium", "low"] as const) {
    if (severities.includes(s)) return s;
  }
  return "low";
}

/**
 * Performance budgets that the page blew.
 *
 * One finding per failed line rather than one for the run, because each
 * line is a different fix — an image budget and a script budget are not
 * solved by the same work. The label is the stable part; the numbers
 * move every run and belong in the details.
 */
export function perfBudgetFindings(
  lines: readonly { label: string; budget: string; actual: string; passed: boolean }[],
): FindingDraft[] {
  return lines
    .filter((l) => !l.passed)
    .map((l) => ({
      signature: `perf-budget.${slug(l.label)}`,
      title: `Over budget: ${l.label}`,
      severity: "medium" as const,
      category: "performance",
      details: `Budget ${l.budget}, measured ${l.actual}.`,
    }));
}

/**
 * URLs that did not survive a migration.
 *
 * Grouped by outcome, because "forty pages now 404" is one piece of work
 * and forty findings would be forty things to close for it. A redirect
 * to somewhere unrelated is kept separate from a 404 on purpose: the
 * second is obviously broken, while the first looks fine in a browser
 * and quietly loses the page's history.
 */
export function parityFindings(report: {
  total: number;
  rows: readonly {
    oldUrl: string;
    outcome: string;
    newStatus: number | null;
  }[];
}): FindingDraft[] {
  const LABEL: Record<string, string> = {
    "404": "Pages that are gone since the migration",
    "5xx": "Pages returning a server error since the migration",
    redirected_to_unrelated:
      "Pages redirected somewhere unrelated since the migration",
    error: "Pages that could not be checked",
  };
  const SEVERITY: Record<string, FindingDraft["severity"]> = {
    "404": "high",
    "5xx": "critical",
    redirected_to_unrelated: "high",
    error: "low",
  };

  const byOutcome = new Map<string, typeof report.rows>();
  for (const r of report.rows) {
    if (r.outcome === "ok") continue;
    const list = byOutcome.get(r.outcome);
    if (list) (list as unknown[]).push(r);
    else byOutcome.set(r.outcome, [r] as typeof report.rows);
  }

  return [...byOutcome.entries()].map(([outcome, rows]) => ({
    signature: `migration-parity.${outcome}`,
    title: `${LABEL[outcome] ?? outcome} — ${rows.length} of ${report.total}`,
    severity: SEVERITY[outcome] ?? "medium",
    category: "migration",
    details:
      `Affected: ${rows.slice(0, 8).map((r) => r.oldUrl).join(", ")}` +
      (rows.length > 8 ? ` and ${rows.length - 8} more.` : "."),
  }));
}

/**
 * What only a real browser can see.
 *
 * This tool renders the page, which means its findings are about things
 * a fetch-and-parse check cannot know: scripts that threw, requests that
 * failed, and a page whose title or h1 exists only after JavaScript ran.
 * Everything the static crawler already checks is deliberately left to
 * the crawler.
 */
export function renderFindings(result: {
  consoleErrors: readonly { text: string }[];
  networkErrors: readonly { url: string; message: string }[];
  page: { title: string | null; h1: string | null };
}): FindingDraft[] {
  const out: FindingDraft[] = [];

  if (result.consoleErrors.length > 0) {
    out.push({
      signature: "render.console_errors",
      title: `${result.consoleErrors.length} JavaScript error${result.consoleErrors.length === 1 ? "" : "s"} on load`,
      // A script that throws often stops the ones after it, so the
      // visible symptom is usually somewhere else entirely.
      severity: "medium",
      category: "rendering",
      details:
        result.consoleErrors
          .slice(0, 3)
          .map((e) => e.text.slice(0, 120))
          .join(" | ") +
        (result.consoleErrors.length > 3
          ? ` and ${result.consoleErrors.length - 3} more.`
          : "."),
    });
  }

  if (result.networkErrors.length > 0) {
    out.push({
      signature: "render.network_errors",
      title: `${result.networkErrors.length} request${result.networkErrors.length === 1 ? "" : "s"} failed while rendering`,
      severity: "medium",
      category: "rendering",
      details:
        result.networkErrors
          .slice(0, 3)
          .map((e) => `${e.url}: ${e.message}`.slice(0, 140))
          .join(" | ") +
        (result.networkErrors.length > 3
          ? ` and ${result.networkErrors.length - 3} more.`
          : "."),
    });
  }

  return out;
}

/** A stable, readable id fragment from a human label. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
