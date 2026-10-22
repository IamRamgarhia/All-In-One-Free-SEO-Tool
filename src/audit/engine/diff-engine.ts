import type { RuleDiffResult, RuleStatus } from "@/audit/types";

const RANK: Record<string, number> = {
  fail: 3,
  warn: 2,
  pass: 1,
  unmeasured: 0,
};

/**
 * Compare two audits of the same site by rule_id (not by score alone).
 */
export function diffRuleStatuses(
  previous: Record<string, RuleStatus | string>,
  current: Record<string, RuleStatus | string>,
): RuleDiffResult {
  const fixedRules: string[] = [];
  const regressedRules: string[] = [];
  const worsenedRules: string[] = [];
  const newIssues: string[] = [];

  const ids = new Set([...Object.keys(previous), ...Object.keys(current)]);
  for (const ruleId of ids) {
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
    if ((RANK[curr] ?? 0) > (RANK[prev] ?? 0) && curr === "fail" && !previous[ruleId]) {
      newIssues.push(ruleId);
    }
  }

  return { fixedRules, regressedRules, worsenedRules, newIssues };
}
