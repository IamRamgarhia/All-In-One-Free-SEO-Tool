import type { AuditRule } from "@/audit/types";

const rules = new Map<string, AuditRule>();
const resettables = new Set<() => void>();

export function registerRule(rule: AuditRule): void {
  if (rules.has(rule.id)) {
    throw new Error(`Duplicate audit rule id: ${rule.id}`);
  }
  rules.set(rule.id, rule);
}

export function getAllRules(): AuditRule[] {
  return Array.from(rules.values());
}

export function getRulesByCategory(categoryId: string): AuditRule[] {
  return getAllRules().filter((r) => r.category === categoryId);
}

export function getRuleById(ruleId: string): AuditRule | undefined {
  return rules.get(ruleId);
}

export function getRuleCount(): number {
  return rules.size;
}

export function clearRegistry(): void {
  rules.clear();
}

export function registerResettable(reset: () => void): void {
  resettables.add(reset);
}

export function resetCrossPageState(): void {
  for (const reset of resettables) reset();
}
