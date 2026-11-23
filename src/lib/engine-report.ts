import { getCategoryById, getFixSuggestion, getRuleById } from "@/audit/catalog";
import { isNotMeasured } from "@/audit/engine/define-rule";
import { collectFindings, type Finding } from "@/audit/report/findings";
import type { AuditResult, PageSnapshot, RuleStatus } from "@/audit/types";
import { isAdvisoryRule } from "./advisory-rules";
import { seoScoreOf } from "./seo-score";

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
  /** Good practice, not ranking: outside the SEO score (lib/advisory-rules.ts) */
  advisory: boolean;
};

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
  page: PageSnapshot | null;
  pages: string[];
};

const WORST: RuleStatus[] = ["fail", "warn", "pass", "not-measured"];

/** True for a stored `raw_report` that carries the engine's per-rule results. */
export function isEngineReport(raw: unknown): raw is AuditResult {
  return (
    raw != null &&
    typeof raw === "object" &&
    Array.isArray((raw as { categoryResults?: unknown }).categoryResults)
  );
}

export function buildEngineReport(result: AuditResult, topCount = 10): EngineReport {
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
        name: getRuleById(ruleId)?.name ?? ruleId,
        categoryId: category.categoryId,
        categoryName: name,
        status,
        findings: findings.map(({ message, status, pages, pageCount }) => ({
          message,
          status,
          pages,
          pageCount,
        })),
        priority: Math.max(0, ...findings.map((f) => f.priority)),
        fix: getFixSuggestion(ruleId),
        advisory: isAdvisoryRule(ruleId),
      };
    });

    for (const k of WORST) totals[k] += counts[k];
    const byPriority = (a: RuleRow, b: RuleRow) =>
      WORST.indexOf(a.status) - WORST.indexOf(b.status) ||
      b.priority - a.priority ||
      a.name.localeCompare(b.name);
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

  // What to fix first: SEO problems only, good practice stays in its category.
  const top = categories
    .flatMap((c) => c.issues)
    .filter((r) => !r.advisory)
    .sort(
      (a, b) =>
        WORST.indexOf(a.status) - WORST.indexOf(b.status) ||
        b.priority - a.priority ||
        a.ruleId.localeCompare(b.ruleId),
    )
    .slice(0, topCount);

  return {
    url: result.url,
    score: seoScoreOf(result),
    totals,
    categories,
    top,
    page: result.page ?? null,
    pages: result.coverage?.pages ?? [result.url],
  };
}
