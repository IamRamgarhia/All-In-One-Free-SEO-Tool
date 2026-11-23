/**
 * The SEO score: the engine's own formula (weighted rule average per
 * category, weighted categories, score caps) without the good-practice rules
 * (lib/advisory-rules.ts). A category left with no scored rule drops out of
 * the average instead of counting as 0 or 100. A cap the engine applied
 * (noindex, blocked by robots.txt, no title, thin content) still applies.
 *
 * The engine's overallScore stays as it is, checked against SEOmator by the
 * parity test; this is the score the app stores and shows. Pure.
 */
import { categories as engineCategories } from "@/audit/engine/categories";
import { calculateCategoryScore, calculateOverallScore } from "@/audit/scoring/scoring";
import type { RuleResult } from "@/audit/types";
import { isAdvisoryRule } from "./advisory-rules";

export type ScorableResult = {
  overallScore: number;
  scoreCap?: unknown;
  categoryResults: ReadonlyArray<{ categoryId: string; results: ReadonlyArray<Pick<RuleResult, "ruleId" | "status" | "weight">> }>;
};

export function seoScoreOf(result: ScorableResult): number {
  const scored = result.categoryResults
    .map((c) => ({ categoryId: c.categoryId, results: c.results.filter((r) => !isAdvisoryRule(r.ruleId)) }))
    .filter((c) => c.results.length > 0)
    .map((c) => ({ categoryId: c.categoryId, score: calculateCategoryScore([...c.results]) }));
  const uncapped = calculateOverallScore(scored, engineCategories);
  return result.scoreCap ? Math.min(uncapped, result.overallScore) : uncapped;
}
