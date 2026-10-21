import { clearRegistry, getRuleCount } from "@/audit/engine/rule-registry";
import { registerCoreRules } from "@/audit/rules/core";
import { registerTechnicalRules } from "@/audit/rules/technical";
import { registerCrawlabilityRules } from "@/audit/rules/crawlability";
import { registerLinkRules } from "@/audit/rules/links";
import { registerRedirectRules } from "@/audit/rules/redirects";
import { registerUrlStructureRules } from "@/audit/rules/url-structure";
import { registerJavascriptRules } from "@/audit/rules/javascript";
import { registerPerformanceRules } from "@/audit/rules/performance";
import { registerImageRules } from "@/audit/rules/images";

let loaded = false;

/** Wave 1–3 rule registration (idempotent). */
export function ensureNativeRulesRegistered(): number {
  if (loaded && getRuleCount() > 0) return getRuleCount();
  clearRegistry();
  // Wave 1
  registerCoreRules();
  registerTechnicalRules();
  registerCrawlabilityRules();
  // Wave 2
  registerLinkRules();
  registerRedirectRules();
  registerUrlStructureRules();
  // Wave 3
  registerJavascriptRules();
  registerPerformanceRules();
  registerImageRules();
  loaded = true;
  return getRuleCount();
}

/** @deprecated use ensureNativeRulesRegistered */
export function ensureWave1RulesRegistered(): number {
  return ensureNativeRulesRegistered();
}

export const WAVE1_AND_2_CATEGORIES = [
  "core",
  "technical",
  "crawlability",
  "links",
  "redirect",
  "url",
] as const;

export const WAVE1_2_3_CATEGORIES = [
  ...WAVE1_AND_2_CATEGORIES,
  "js",
  "perf",
  "images",
] as const;
