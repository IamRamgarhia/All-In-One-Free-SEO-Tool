import type { AuditRule } from "@/audit/types";

export const rules = new Map<string, AuditRule>();

export function registerRule(rule: AuditRule): void {
  const existing = rules.get(rule.id);
  // The same object again is a module evaluated twice (dev reloads), not a
  // clash. Two different rules sharing an id is a bug worth stopping on.
  if (existing === rule) return;
  // A rule file edited while 'next dev' runs is evaluated again and hands in a
  // new object with the same id and name: the edited version replaces the old
  // one. Only in development; a real clash still stops the build and the app.
  if (existing && process.env.NODE_ENV !== "production" && existing.name === rule.name) {
    rules.set(rule.id, rule);
    return;
  }
  if (existing) {
    throw new Error(
      `Duplicate rule ID: "${rule.id}" is already registered. Each rule must have a unique identifier.`,
    );
  }
  rules.set(rule.id, rule);
}

export function getAllRules(): AuditRule[] {
  return Array.from(rules.values());
}

export function getRulesByCategory(categoryId: string): AuditRule[] {
  return Array.from(rules.values()).filter((rule) => rule.category === categoryId);
}

export function getRuleById(ruleId: string): AuditRule | undefined {
  return rules.get(ruleId);
}

/**
 * Rules that keep state across the pages of one crawl (duplicate titles,
 * near-duplicate content…) register a reset here. The audit runner calls
 * resetCrossPageState() before each audit, and runs audits one at a time
 * so two crawls never share that state.
 */
export const resettables = new Set<() => void>();

export function registerResettable(reset: () => void): void {
  resettables.add(reset);
}

export function resetCrossPageState(): void {
  for (const reset of resettables) {
    reset();
  }
}

export function getRuleCount(): number {
  return rules.size;
}
