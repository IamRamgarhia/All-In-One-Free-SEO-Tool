import { AUDIT_CATEGORIES } from "@/audit/engine/categories";
import type {
  AuditContext,
  AuditRule,
  CategoryScore,
  RuleResult,
  RuleStatus,
  ScoreCap,
  ScoreResult,
} from "@/audit/types";

const STATUS_SCORES: Record<RuleStatus, number> = {
  pass: 100,
  warn: 50,
  fail: 0,
  unmeasured: 0,
};

export function statusScore(status: RuleStatus): number {
  return STATUS_SCORES[status];
}

export function calculateCategoryScore(
  results: Array<RuleResult & { weight?: number }>,
): number {
  let totalScore = 0;
  let totalWeight = 0;
  for (const r of results) {
    if (r.status === "unmeasured") continue;
    const w = r.weight ?? 1;
    totalScore += statusScore(r.status) * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return 0;
  return Math.round(totalScore / totalWeight);
}

export function calculateOverallScore(categories: CategoryScore[]): number {
  const weightById = new Map(AUDIT_CATEGORIES.map((c) => [c.id, c.weight]));
  let total = 0;
  let weight = 0;
  for (const cat of categories) {
    const w = weightById.get(cat.categoryId) ?? 0;
    if (w <= 0) continue;
    // Only count categories that produced measured results.
    if (cat.pass + cat.warn + cat.fail === 0) continue;
    total += cat.score * w;
    weight += w;
  }
  if (weight === 0) return 0;
  return Math.round(total / weight);
}

/**
 * Intelligent caps — a non-indexable / empty / title-less page cannot look healthy.
 */
export function computeScoreCaps(
  context: AuditContext,
  pageResults: Array<RuleResult & { ruleId: string }>,
): ScoreCap[] {
  const caps: ScoreCap[] = [];
  const byId = new Map(pageResults.map((r) => [r.ruleId, r]));

  const robots = byId.get("core-robots-meta");
  if (robots?.status === "fail" || /noindex/i.test(robots?.message ?? "")) {
    caps.push({
      id: "noindex",
      ceiling: 20,
      reason: "Page is noindex — search engines will not rank it",
    });
  }

  if (context.page.status === 403 || context.page.status === 401) {
    caps.push({
      id: "blocked",
      ceiling: 15,
      reason: `HTTP ${context.page.status} — page is not publicly crawlable`,
    });
  }

  const title = byId.get("core-title-present");
  if (title?.status === "fail") {
    caps.push({
      id: "missing-title",
      ceiling: 40,
      reason: "Missing document title",
    });
  }

  if (context.page.wordCount > 0 && context.page.wordCount < 20) {
    caps.push({
      id: "thin-page",
      ceiling: 35,
      reason: `Page has only ${context.page.wordCount} words`,
    });
  }

  if (
    context.crawl?.blockedByRobots.includes(context.url) ||
    context.crawl?.blockedByRobots.includes(context.page.finalUrl)
  ) {
    caps.push({
      id: "robots-blocked",
      ceiling: 20,
      reason: "URL is disallowed by robots.txt",
    });
  }

  return caps;
}

export function applyCaps(
  uncapped: number,
  caps: ScoreCap[],
): { score: number; applied: ScoreCap[] } {
  if (caps.length === 0) return { score: uncapped, applied: [] };
  const sorted = [...caps].sort((a, b) => a.ceiling - b.ceiling);
  const lowest = sorted[0]!;
  if (uncapped <= lowest.ceiling) return { score: uncapped, applied: [] };
  return { score: lowest.ceiling, applied: sorted };
}

export function buildCategoryScores(
  rules: AuditRule[],
  resultsByRule: Map<string, RuleResult & { ruleId: string }>,
): CategoryScore[] {
  const byCat = new Map<string, AuditRule[]>();
  for (const rule of rules) {
    const list = byCat.get(rule.category) ?? [];
    list.push(rule);
    byCat.set(rule.category, list);
  }

  const out: CategoryScore[] = [];
  for (const [categoryId, catRules] of byCat) {
    const results = catRules.map((rule) => {
      const r = resultsByRule.get(rule.id) ?? {
        ruleId: rule.id,
        status: "unmeasured" as const,
        message: "Not evaluated",
        weight: 0,
      };
      return {
        ...r,
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        weight: r.status === "unmeasured" ? 0 : (r.weight ?? rule.weight),
      };
    });
    let pass = 0;
    let warn = 0;
    let fail = 0;
    let unmeasured = 0;
    for (const r of results) {
      switch (r.status) {
        case "pass":
          pass++;
          break;
        case "warn":
          warn++;
          break;
        case "fail":
          fail++;
          break;
        case "unmeasured":
          unmeasured++;
          break;
        default: {
          const _exhaustive: never = r.status;
          void _exhaustive;
        }
      }
    }
    out.push({
      categoryId,
      score: calculateCategoryScore(results),
      pass,
      warn,
      fail,
      unmeasured,
      results,
    });
  }
  return out.sort((a, b) => a.categoryId.localeCompare(b.categoryId));
}

export function finalizeScore(
  categories: CategoryScore[],
  caps: ScoreCap[],
): ScoreResult {
  const uncappedScore = calculateOverallScore(categories);
  const { score, applied } = applyCaps(uncappedScore, caps);
  return {
    globalScore: score,
    uncappedScore,
    caps: applied,
    categories,
  };
}
