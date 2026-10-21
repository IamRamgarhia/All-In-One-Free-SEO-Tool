/**
 * Compare two SEOmator-normalized rule status maps.
 *
 * fail → pass  = fixed
 * pass → fail  = regression
 * warn → fail  = worsened
 * new fail     = new issue
 */

export type RuleStatus = "pass" | "warn" | "fail" | "not-measured" | string;

export type DiffResult = {
  fixedRules: string[];
  regressedRules: string[];
  newIssues: string[];
  worsenedRules: string[];
};

export function diffRuleStatuses(
  previous: Record<string, RuleStatus>,
  current: Record<string, RuleStatus>,
): DiffResult {
  const fixedRules: string[] = [];
  const regressedRules: string[] = [];
  const newIssues: string[] = [];
  const worsenedRules: string[] = [];

  const allIds = new Set([...Object.keys(previous), ...Object.keys(current)]);

  for (const ruleId of allIds) {
    const prev = previous[ruleId];
    const curr = current[ruleId];

    if (!prev && curr === "fail") {
      newIssues.push(ruleId);
      continue;
    }
    if (!prev || !curr) continue;

    if (prev === "fail" && curr === "pass") {
      fixedRules.push(ruleId);
      continue;
    }
    if (prev === "pass" && curr === "fail") {
      regressedRules.push(ruleId);
      continue;
    }
    if (prev === "warn" && curr === "fail") {
      worsenedRules.push(ruleId);
      continue;
    }
    if ((prev === "pass" || prev === "warn") && curr === "fail" && !previous[ruleId]) {
      newIssues.push(ruleId);
    }
  }

  return { fixedRules, regressedRules, newIssues, worsenedRules };
}

export function scoreDelta(
  previous: number | null | undefined,
  current: number | null | undefined,
): number | null {
  if (typeof previous !== "number" || typeof current !== "number") return null;
  return current - previous;
}
