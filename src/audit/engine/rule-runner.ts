import type { AuditContext, AuditRule, RuleResult } from "@/audit/types";

export async function runRule(
  rule: AuditRule,
  context: AuditContext,
): Promise<RuleResult & { ruleId: string }> {
  if (rule.requiresCrawl && !context.crawl) {
    return {
      ruleId: rule.id,
      status: "unmeasured",
      message: "Rule requires crawl context",
      weight: 0,
    };
  }
  if (rule.requiresRendering && !context.renderedHtml) {
    return {
      ruleId: rule.id,
      status: "unmeasured",
      message: "Rule requires Playwright rendering",
      weight: 0,
    };
  }

  try {
    const result = await rule.check(context);
    return {
      ...result,
      ruleId: rule.id,
      weight:
        result.status === "unmeasured"
          ? 0
          : (result.weight ?? rule.weight),
    };
  } catch (err) {
    return {
      ruleId: rule.id,
      status: "unmeasured",
      message: err instanceof Error ? err.message : "Rule threw",
      weight: 0,
      details: { error: true },
    };
  }
}

export async function runRules(
  rules: AuditRule[],
  context: AuditContext,
): Promise<Array<RuleResult & { ruleId: string }>> {
  const out: Array<RuleResult & { ruleId: string }> = [];
  for (const rule of rules) {
    out.push(await runRule(rule, context));
  }
  return out;
}
