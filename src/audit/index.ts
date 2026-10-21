/**
 * Native technical audit engine (SEOmator expertise ported in-house).
 *
 * Wave 1: core + technical + crawlability.
 * Legacy `src/lib/audit.ts` and the temporary npm bridge remain until stable.
 */

export { runNativeAudit, defaultAuditConfig, diffRuleStatuses } from "@/audit/engine/audit-runner";
export {
  ensureNativeRulesRegistered,
  ensureWave1RulesRegistered,
} from "@/audit/rules/register-native";
export { getRuleCount, getAllRules, getRuleById } from "@/audit/engine/rule-registry";
export {
  saveNativeAuditRun,
  listNativeAudits,
  getNativeAudit,
} from "@/audit/storage/audit-repository";
export type {
  AuditRunResult,
  AuditConfig,
  AuditIssue,
  RuleStatus,
} from "@/audit/types";
