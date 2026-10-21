/**
 * Sidecar rule engine (~216 rules) — lab / future in-house port.
 * Production technical audits use `@seomator/seo-audit` via `src/lib/seomator-audit.ts`.
 */

export { runNativeAudit, defaultAuditConfig, diffRuleStatuses } from "@/audit/engine/audit-runner";
export {
  ensureNativeRulesRegistered,
  ensureWave1RulesRegistered,
} from "@/audit/rules/register-native";
export { getRuleCount, getAllRules, getRuleById } from "@/audit/engine/rule-registry";
export type {
  AuditRunResult,
  AuditConfig,
  AuditIssue,
  RuleStatus,
} from "@/audit/types";
