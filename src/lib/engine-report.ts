import { getCategoryById, getFixSuggestion, getRuleById } from "@/audit/catalog";
import { isNotMeasured } from "@/audit/engine/define-rule";
import { collectFindings, type Finding } from "@/audit/report/findings";
import type { AuditResult, PageSnapshot, RuleStatus } from "@/audit/types";
import { type SiteKind } from "./advisory-rules";
import { isScoredTier, ruleTier, RULE_TIERS, type RuleTier } from "./rule-tiers";
import { seoScoreOf } from "./seo-score";
import { ruleNamesFr } from "./rule-names.fr";
import { FIX_SUGGESTIONS_FR } from "@/audit/engine/fix-suggestions.fr";
import { translateEngineMessage } from "@/audit/engine/translate-message";

/**
 * The audit page's reading of a stored engine report, laid out the way
 * SEOmator's HTML report is: one status per rule, rules grouped by
 * category, and a short list of what to fix first.
 *
 * A crawl stores one result per rule per page. A rule's status is the
 * worst reading it took (fail, then warn, then pass); it is "not measured"
 * only when no page gave it a reading at all.
 */

export type RuleRow = {
  ruleId: string;
  name: string;
  categoryId: string;
  categoryName: string;
  status: RuleStatus;
  /** Distinct non-passing messages, each with the pages it was seen on */
  findings: Pick<Finding, "message" | "status" | "pages" | "pageCount">[];
  priority: number;
  fix: string;
  /** What the rule is for the reader: SEO, complementary, informative, off-topic (lib/rule-tiers.ts) */
  tier: RuleTier;
  /** Good practice, not ranking: outside the SEO score (the info and off-topic tiers) */
  advisory: boolean;
};

/** Rule counts by status, for one tier. */
export type TierCounts = Record<RuleStatus, number>;

export type CategoryRow = {
  id: string;
  name: string;
  score: number;
  /** Share of the overall score, out of the categories' total weight */
  weight: number;
  counts: Record<RuleStatus, number>;
  /** Failures then warnings, highest priority first */
  issues: RuleRow[];
  /** Passed and not measured: the "checks that need no action" */
  quiet: RuleRow[];
};

export type EngineReport = {
  /** The audited URL */
  url: string;
  score: number;
  totals: Record<RuleStatus, number> & { total: number };
  categories: CategoryRow[];
  top: RuleRow[];
  /** Every rule by tier, failures and warnings first (lib/rule-tiers.ts) */
  tiers: Record<RuleTier, { counts: TierCounts; issues: RuleRow[]; quiet: RuleRow[] }>;
  page: PageSnapshot | null;
  pages: string[];
};

const WORST: RuleStatus[] = ["fail", "warn", "pass", "not-measured"];

const byPriority = (a: RuleRow, b: RuleRow) =>
  WORST.indexOf(a.status) - WORST.indexOf(b.status) || b.priority - a.priority || a.name.localeCompare(b.name);

/** True for a stored `raw_report` that carries the engine's per-rule results. */
export function isEngineReport(raw: unknown): raw is AuditResult {
  return (
    raw != null &&
    typeof raw === "object" &&
    Array.isArray((raw as { categoryResults?: unknown }).categoryResults)
  );
}

export function buildEngineReport(
  result: AuditResult,
  topCount = 10,
  kind?: SiteKind | null,
  /** Reader's language: French rule names and fixes. */
  locale: string = "en",
): EngineReport {
  const fr = locale === "fr";
  const findingsByRule = new Map<string, Finding[]>();
  for (const f of collectFindings(result)) {
    const list = findingsByRule.get(f.ruleId) ?? [];
    list.push(f);
    findingsByRule.set(f.ruleId, list);
  }

  const totals = { fail: 0, warn: 0, pass: 0, "not-measured": 0, total: 0 };
  const categories: CategoryRow[] = [];

  for (const category of result.categoryResults) {
    const meta = getCategoryById(category.categoryId);
    const name = meta?.name ?? category.categoryId;
    const statuses = new Map<string, RuleStatus>();
    for (const r of category.results) {
      const status: RuleStatus = isNotMeasured(r) ? "not-measured" : r.status;
      const prev = statuses.get(r.ruleId);
      if (!prev || WORST.indexOf(status) < WORST.indexOf(prev)) statuses.set(r.ruleId, status);
    }

    const counts = { fail: 0, warn: 0, pass: 0, "not-measured": 0 };
    const rows: RuleRow[] = [...statuses].map(([ruleId, status]) => {
      counts[status]++;
      const findings = (findingsByRule.get(ruleId) ?? []).filter(
        (f) => f.categoryId === category.categoryId && (f.status === "fail" || f.status === "warn"),
      );
      return {
        ruleId,
        name: (fr ? ruleNamesFr[ruleId] : undefined) ?? getRuleById(ruleId)?.name ?? ruleId,
        categoryId: category.categoryId,
        categoryName: name,
        status,
        findings: findings.map(({ message, status, pages, pageCount }) => ({
          message: fr ? translateEngineMessage(ruleId, message) : message,
          status,
          pages,
          pageCount,
        })),
        priority: Math.max(0, ...findings.map((f) => f.priority)),
        fix: (fr ? FIX_SUGGESTIONS_FR[ruleId] : undefined) ?? getFixSuggestion(ruleId),
        tier: ruleTier(ruleId, kind),
        advisory: !isScoredTier(ruleTier(ruleId, kind)),
      };
    });

    for (const k of WORST) totals[k] += counts[k];
    categories.push({
      id: category.categoryId,
      name,
      score: category.score,
      weight: meta?.weight ?? 0,
      counts,
      issues: rows.filter((r) => r.status === "fail" || r.status === "warn").sort(byPriority),
      quiet: rows.filter((r) => r.status === "pass" || r.status === "not-measured").sort(byPriority),
    });
  }
  totals.total = totals.fail + totals.warn + totals.pass + totals["not-measured"];

  // What to fix first: what Google uses only. Complementary rules come in
  // their own tier, good practice and off-topic ones stay apart.
  const top = categories
    .flatMap((c) => c.issues)
    .filter((r) => r.tier === "seo")
    .sort(
      (a, b) =>
        WORST.indexOf(a.status) - WORST.indexOf(b.status) ||
        b.priority - a.priority ||
        a.ruleId.localeCompare(b.ruleId),
    )
    .slice(0, topCount);

  const tiers = Object.fromEntries(
    RULE_TIERS.map((tier) => {
      const rows = categories.flatMap((c) => [...c.issues, ...c.quiet]).filter((r) => r.tier === tier);
      const counts: TierCounts = { fail: 0, warn: 0, pass: 0, "not-measured": 0 };
      for (const r of rows) counts[r.status]++;
      return [
        tier,
        {
          counts,
          issues: rows.filter((r) => r.status === "fail" || r.status === "warn").sort(byPriority),
          quiet: rows.filter((r) => r.status === "pass" || r.status === "not-measured").sort(byPriority),
        },
      ];
    }),
  ) as EngineReport["tiers"];

  return {
    url: result.url,
    score: seoScoreOf(result, kind),
    totals,
    categories,
    top,
    tiers,
    page: result.page ?? null,
    pages: result.coverage?.pages ?? [result.url],
  };
}
