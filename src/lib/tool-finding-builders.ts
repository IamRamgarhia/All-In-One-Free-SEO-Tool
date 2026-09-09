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

/**
 * Pages of a site competing with each other for one query.
 *
 * Only where it is actually costing something. Two pages appearing for
 * the same query is normal — a category and a product legitimately both
 * rank — and it only becomes cannibalisation when neither wins because
 * the signals are split between them.
 *
 * Keyed on the query, because that is what has to be decided about: one
 * page gets to own it and the others point at that one. The pages
 * involved change as a site is edited; the decision does not.
 */
export function cannibalFindings(
  groups: readonly {
    query: string;
    pages: readonly { page: string; position: number; clicks: number }[];
    totalClicks: number;
  }[],
): FindingDraft[] {
  const contested = groups.filter((g) => g.pages.length >= 2);
  if (contested.length === 0) return [];

  // Worst first: the query with the most traffic at stake is the one
  // worth an afternoon.
  const ranked = [...contested].sort((a, b) => b.totalClicks - a.totalClicks);

  return ranked.slice(0, 10).map((g) => ({
    signature: `cannibalization.${slug(g.query)}`,
    title: `${g.pages.length} pages compete for "${g.query}"`,
    // Traffic already arriving is evidence the query matters; a
    // contested query nobody clicks is a curiosity.
    severity: g.totalClicks >= 50 ? "medium" : "low",
    category: "cannibalization",
    details:
      `Google is choosing between ${g.pages
        .slice(0, 4)
        .map((p) => `${p.page} (#${Math.round(p.position)})`)
        .join(", ")}` +
      (g.pages.length > 4 ? ` and ${g.pages.length - 4} more` : "") +
      `. ${g.totalClicks} clicks are split across them, so no single page ` +
      "accumulates the signals that would let it win outright.",
  }));
}

/**
 * Core Web Vitals measured in a real browser on this machine.
 *
 * Thresholds are Google's own published "good" boundaries rather than
 * numbers chosen here, because the whole value of this check is that it
 * matches what Search Console will eventually say.
 *
 * Not mapped for the agent. Every fix is a server, theme or image
 * change, and none of them is reachable through a CMS metadata write.
 */
export function cwvFindings(result: {
  lcpMs: number | null;
  cls: number | null;
  ttfbMs?: number | null;
}): FindingDraft[] {
  const out: FindingDraft[] = [];

  if (typeof result.lcpMs === "number" && result.lcpMs > 2500) {
    out.push({
      signature: "local-cwv.slow_lcp",
      title: `Largest Contentful Paint is ${(result.lcpMs / 1000).toFixed(1)}s`,
      // 4s is Google's boundary between "needs improvement" and "poor".
      severity: result.lcpMs > 4000 ? "high" : "medium",
      category: "performance",
      details:
        "Google treats anything over 2.5 seconds as needing improvement. LCP is the moment " +
        "the main thing on the page appears, which is what a visitor experiences as the " +
        "page having loaded.",
    });
  }

  if (typeof result.cls === "number" && result.cls > 0.1) {
    out.push({
      signature: "local-cwv.layout_shift",
      title: `Cumulative Layout Shift is ${result.cls.toFixed(2)}`,
      severity: result.cls > 0.25 ? "high" : "medium",
      category: "performance",
      details:
        "Google treats anything over 0.1 as needing improvement. This is the metric behind " +
        "content jumping as a page loads, which is why people tap the wrong thing.",
    });
  }

  if (typeof result.ttfbMs === "number" && result.ttfbMs > 800) {
    out.push({
      signature: "local-cwv.slow_ttfb",
      title: `Time to First Byte is ${Math.round(result.ttfbMs)}ms`,
      severity: "medium",
      category: "performance",
      details:
        "Over 800ms and the server is the bottleneck rather than the page. Every other " +
        "timing measured here starts after this one finishes, so nothing else can be fast.",
    });
  }

  return out;
}

/**
 * A month-over-month fall in organic clicks.
 *
 * The AI diagnosis this tool also produces is deliberately NOT recorded.
 * It is a model's ranked guess at causes, it varies between runs, and a
 * guess that persists into a client report reads as a conclusion. The
 * numbers underneath it do not vary, so those are what is kept.
 *
 * A single finding rather than one per query. The drop is one event to
 * investigate, and the queries and pages that lost most are evidence
 * for it rather than separate pieces of work.
 */
export function trafficDropFindings(result: {
  recentClicks: number;
  prevClicks: number;
  clicksDelta: number;
  clicksDeltaPct: number;
  topQueryDrops: readonly { query: string; delta: number }[];
  topPageDrops: readonly { page: string; delta: number }[];
  algorithmOverlaps: readonly { name?: string; title?: string }[];
}): FindingDraft[] {
  // Up, flat, or noise. Small sites swing by a few percent every month
  // and reporting that as a finding would cry wolf.
  if (result.clicksDeltaPct > -10 || result.prevClicks < 50) return [];

  const pct = Math.abs(Math.round(result.clicksDeltaPct));
  const algo = result.algorithmOverlaps
    .map((a) => a.name ?? a.title)
    .filter(Boolean);

  return [
    {
      signature: "traffic-drop.clicks_down",
      title: `Organic clicks down ${pct}% month over month`,
      // A third of the traffic is a different conversation from a tenth.
      severity: pct >= 30 ? "high" : "medium",
      category: "traffic",
      details:
        `${result.prevClicks} clicks in the previous 28 days, ${result.recentClicks} in the ` +
        `most recent. Worst queries: ${result.topQueryDrops
          .slice(0, 3)
          .map((q) => `"${q.query}" (${q.delta})`)
          .join(", ")}. Worst pages: ${result.topPageDrops
          .slice(0, 3)
          .map((p) => `${p.page} (${p.delta})`)
          .join(", ")}.` +
        (algo.length > 0
          ? ` A Google update overlaps this window: ${algo.join(", ")}.`
          : " No announced Google update overlaps this window."),
    },
  ];
}

/**
 * URLs a bulk scan found problems on.
 *
 * One finding for the batch, not one per URL. A bulk scan is a sweep to
 * find where to look next, and twenty-five findings from one sweep would
 * bury everything else in the list. The URLs worth opening are named in
 * the details.
 */
export function bulkScanFindings(
  rows: readonly {
    url: string;
    ok: boolean;
    score: number | null;
    critical: number;
    high: number;
  }[],
): FindingDraft[] {
  const out: FindingDraft[] = [];

  const serious = rows.filter((r) => r.ok && (r.critical > 0 || r.high > 0));
  if (serious.length > 0) {
    out.push({
      signature: "bulk-scan.pages_with_serious_issues",
      title: `${serious.length} of ${rows.length} pages scanned have critical or high issues`,
      severity: serious.some((r) => r.critical > 0) ? "high" : "medium",
      category: "audit",
      details:
        serious
          .slice(0, 8)
          .map((r) => `${r.url} (${r.critical} critical, ${r.high} high)`)
          .join(", ") + (serious.length > 8 ? ` and ${serious.length - 8} more.` : "."),
    });
  }

  // A URL that could not be scanned is not a URL without problems, and
  // reporting only on the ones that answered would quietly exclude the
  // pages most likely to be broken.
  const failed = rows.filter((r) => !r.ok);
  if (failed.length > 0) {
    out.push({
      signature: "bulk-scan.unscannable",
      title: `${failed.length} URL${failed.length === 1 ? "" : "s"} could not be scanned`,
      severity: "medium",
      category: "audit",
      details:
        "These returned no result, so nothing is known about them — which is not the same " +
        `as nothing being wrong: ${failed.slice(0, 8).map((r) => r.url).join(", ")}` +
        (failed.length > 8 ? ` and ${failed.length - 8} more.` : "."),
    });
  }

  return out;
}
