import { clearRegistry, getRuleCount } from "@/audit/engine/rule-registry";
import { registerCoreRules } from "@/audit/rules/core";
import { registerTechnicalRules } from "@/audit/rules/technical";
import { registerCrawlabilityRules } from "@/audit/rules/crawlability";

let loaded = false;

/** Idempotent Wave 1 registration (core + technical + crawlability). */
export function ensureWave1RulesRegistered(): number {
  if (loaded && getRuleCount() > 0) return getRuleCount();
  clearRegistry();
  registerCoreRules();
  registerTechnicalRules();
  registerCrawlabilityRules();
  loaded = true;
  return getRuleCount();
}
