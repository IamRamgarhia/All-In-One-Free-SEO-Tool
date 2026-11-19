/**
 * Which finding to fix first, weighted by the traffic the page actually
 * gets.
 *
 * WHY: a crawl of three sites on this install produced 789 findings.
 * The planner ordered them by a static weight per finding type — so a
 * missing meta description on a page nobody has ever visited sorted
 * identically to the same problem on the page that earns the money.
 * 789 equally-ranked items is not a plan, it is a wall, and the usual
 * response to a wall is to do none of it. Which is what happened: 115
 * tasks open, none ever completed.
 *
 * Search Console already knows which pages get impressions. Nothing in
 * the codebase joined that to the findings.
 *
 * THE THING THIS MUST NOT DO
 *
 * Silently rank everything zero when there is no traffic data, and
 * present the result as if it were traffic-weighted. On the maintainer's
 * own install Search Console returns 403 for every client, so the
 * no-data path is not an edge case — it is the common one. `basis` says
 * which ordering you are looking at, and every surface has to show it.
 * That is the same provenance rule as ConfidenceBadge and
 * FreshnessBadge: a number shown to a user needs to say where it came
 * from.
 */

import type { AuditFindingType } from "./audit-finding-types";

export type PagePerf = {
  /** Full URL as Search Console reports it. */
  page: string;
  clicks: number;
  impressions: number;
  position: number;
};

/** What the ordering is actually based on. Never inferred by a caller. */
export type PriorityBasis =
  /** Joined to real Search Console impressions. */
  | "traffic"
  /**
   * No usable traffic data, so this is the old severity ordering. Said
   * out loud rather than dressed up as prioritisation.
   */
  | "severity_only";

export type Prioritised<T> = {
  item: T;
  /** Higher first. */
  score: number;
  /** Impressions for the finding's page, or null when unknown. */
  impressions: number | null;
  /** One line a user can read, naming the reason this sorted where it did. */
  reason: string;
};

export type PriorityResult<T> = {
  basis: PriorityBasis;
  items: Prioritised<T>[];
  /** How many findings were matched to a page with traffic data. */
  matched: number;
};

/**
 * Findings whose very nature suppresses the traffic they would be
 * weighted by.
 *
 * This is the subtlety that makes traffic weighting correct rather than
 * naive. A page that is noindexed, blocked in robots.txt or returning
 * 404 has few or no impressions BECAUSE of the finding. Multiplying its
 * importance by its traffic would bury exactly the problems that are
 * costing the most — the circular reasoning that makes a
 * traffic-weighted list worse than no list at all.
 *
 * These keep their severity weight and are never demoted for having no
 * traffic. They can still be promoted if the page somehow does have
 * impressions.
 */
const SUPPRESSES_OWN_TRAFFIC: ReadonlySet<string> = new Set<AuditFindingType>([
  "blocked_by_robots",
  "blocked_url",
  "noindex_set",
  "xrobots_noindex",
  "bad_status",
  "fetch_failed",
  "soft_404",
  "broken_link",
  "missing_sitemap",
  "orphan_pages",
  "spa_empty_body",
  "js_rendered_only",
  "no_https",
  "invalid_robots_txt",
]);

/** Severity → base weight. Mirrors the crawler's own ordering. */
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 100,
  high: 70,
  medium: 40,
  low: 20,
};

/**
 * How much traffic can move a finding up the list.
 *
 * Logarithmic, and capped. Linear weighting lets one page with 100,000
 * impressions drown out everything else on the site, which produces a
 * list as useless as the flat one — just differently. Log10 with this
 * multiplier means roughly: 100 impressions ≈ ×2, 10,000 ≈ ×3,
 * 1,000,000 ≈ ×4. A low-severity issue on a very busy page can overtake
 * a medium-severity one on a quiet page, which is the intended
 * behaviour and the whole reason for doing this.
 */
function trafficMultiplier(impressions: number): number {
  if (impressions <= 0) return 1;
  return 1 + Math.log10(1 + impressions) / 2;
}

/** Same page, ignoring scheme, www and the trailing slash. */
function normaliseUrl(u: string): string {
  return u
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

export function buildPerfIndex(perf: PagePerf[]): Map<string, PagePerf> {
  const out = new Map<string, PagePerf>();
  for (const p of perf) {
    if (!p.page) continue;
    const key = normaliseUrl(p.page);
    // Search Console can report the same page twice across property
    // types. Keep the busier row rather than whichever came last.
    const prev = out.get(key);
    if (!prev || p.impressions > prev.impressions) out.set(key, p);
  }
  return out;
}

/**
 * Order findings by expected impact.
 *
 * `perf` of null or [] is not an error and not an empty result — it
 * means "we could not ask", and the answer is the severity ordering with
 * `basis: "severity_only"` so the caller cannot present it as something
 * it is not.
 */
export function prioritiseFindings<T>(
  items: T[],
  get: (item: T) => { url: string | null; type: string; severity: string },
  perf: PagePerf[] | null,
): PriorityResult<T> {
  const index = perf && perf.length > 0 ? buildPerfIndex(perf) : null;

  let matched = 0;
  const scored: Prioritised<T>[] = items.map((item) => {
    const f = get(item);
    const base = SEVERITY_WEIGHT[f.severity] ?? SEVERITY_WEIGHT.medium;
    const w = weightForTraffic({
      base,
      url: f.url,
      type: f.type,
      index,
      label: `${f.severity} severity`,
    });
    if (w.matchedPage) matched++;
    return { item, score: w.score, impressions: w.impressions, reason: w.reason };
  });

  scored.sort((a, b) => b.score - a.score);

  return {
    basis: index ? "traffic" : "severity_only",
    items: scored,
    matched,
  };
}

/**
 * The scorer, exposed so the planner uses this formula rather than a
 * second copy of it.
 *
 * Two callers with two notions of "importance" — audit findings carry a
 * severity, planned actions carry the planner's own per-kind weight —
 * and one of them already baked severity into its number. So this takes
 * the base weight rather than deriving it, and the fourth standing rule
 * is satisfied by there being one multiplier, not one list.
 */
export function weightForTraffic(opts: {
  /** Importance before traffic is considered. */
  base: number;
  url: string | null;
  /** Finding type, used only to spot the traffic-suppressing ones. */
  type: string;
  index: Map<string, PagePerf> | null;
  /** How to describe the base importance in the reason line. */
  label: string;
}): {
  score: number;
  impressions: number | null;
  reason: string;
  matchedPage: boolean;
} {
  const { base, url, type, index, label } = opts;
  const row = index && url ? index.get(normaliseUrl(url)) : undefined;

  if (!index) {
    return {
      score: base,
      impressions: null,
      reason: `${label}. No Search Console data, so this is severity order only.`,
      matchedPage: false,
    };
  }

  if (SUPPRESSES_OWN_TRAFFIC.has(type)) {
    // Deliberately not multiplied down. The low traffic is the symptom,
    // not a reason to care less.
    return {
      score: base * 1.5,
      impressions: row?.impressions ?? 0,
      reason:
        `${label}, and this problem is itself why the page gets little or ` +
        `no search traffic — so low impressions are a reason to fix it, ` +
        `not to skip it.`,
      matchedPage: Boolean(row),
    };
  }

  if (!row) {
    // No rows in Search Console's window. Not zero importance — the page
    // may be new — but it ranks below pages with measured demand.
    return {
      score: base * 0.9,
      impressions: 0,
      reason:
        `${label}. This page had no Search Console impressions in the ` +
        `window, so it is ranked below pages that do.`,
      matchedPage: false,
    };
  }

  return {
    score: base * trafficMultiplier(row.impressions),
    impressions: row.impressions,
    reason:
      `${label} on a page with ` +
      `${row.impressions.toLocaleString()} impression${row.impressions === 1 ? "" : "s"}` +
      `${row.position > 0 ? ` at average position ${row.position.toFixed(1)}` : ""}.`,
    matchedPage: true,
  };
}

/**
 * One sentence for a surface to print above the list.
 *
 * Exists so the two words that matter — whether this is really
 * traffic-weighted — are written once instead of per screen.
 */
export function describeBasis(result: PriorityResult<unknown>): string {
  if (result.basis === "severity_only") {
    return (
      "Ordered by severity. Connect Search Console to order by how much " +
      "search traffic each page actually gets."
    );
  }
  return (
    `Ordered by impact: severity weighted by Search Console impressions. ` +
    `${result.matched} of ${result.items.length} findings are on pages with ` +
    `measured traffic.`
  );
}
