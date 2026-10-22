import type { AuditRule, RuleResult } from "@/audit/types";

export function defineRule(rule: AuditRule): AuditRule {
  if (!rule.id || !rule.title || !rule.category || typeof rule.check !== "function") {
    throw new Error(`Invalid audit rule: ${rule.id ?? "(missing id)"}`);
  }
  if (rule.weight < 0 || rule.weight > 100) {
    throw new Error(`Rule ${rule.id} weight must be 0–100`);
  }
  return rule;
}

export function pass(
  message: string,
  details?: Record<string, unknown>,
): RuleResult {
  return { status: "pass", score: 100, message, details };
}

export function warn(
  message: string,
  details?: Record<string, unknown>,
): RuleResult {
  return { status: "warn", score: 50, message, details };
}

export function fail(
  message: string,
  details?: Record<string, unknown>,
): RuleResult {
  return { status: "fail", score: 0, message, details };
}

export function unmeasured(
  message: string,
  details?: Record<string, unknown>,
): RuleResult {
  return { status: "unmeasured", score: 0, message, details, weight: 0 };
}
