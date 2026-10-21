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
import { registerContentRules } from "@/audit/rules/content";
import { registerSchemaRules } from "@/audit/rules/schema";
import { registerSecurityRules } from "@/audit/rules/security";
import { registerHtmlRules } from "@/audit/rules/html";
import { registerAccessibilityRules } from "@/audit/rules/accessibility";
import { registerMobileRules } from "@/audit/rules/mobile";
import { registerI18nRules } from "@/audit/rules/i18n";
import { registerEeatRules } from "@/audit/rules/eeat";
import { registerSocialRules } from "@/audit/rules/social";
import { registerGeoRules } from "@/audit/rules/geo";
import { registerLegalRules } from "@/audit/rules/legal";

let loaded = false;

/** Wave 1–5 rule registration (idempotent). */
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
  // Wave 4
  registerContentRules();
  registerSchemaRules();
  registerSecurityRules();
  registerHtmlRules();
  // Wave 5
  registerAccessibilityRules();
  registerMobileRules();
  registerI18nRules();
  registerEeatRules();
  registerSocialRules();
  registerGeoRules();
  registerLegalRules();
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

export const WAVE4_CATEGORIES = ["content", "schema", "security", "html"] as const;

export const WAVE5_CATEGORIES = [
  "a11y",
  "mobile",
  "i18n",
  "eeat",
  "social",
  "geo",
  "legal",
] as const;

export const ALL_NATIVE_CATEGORIES = [
  ...WAVE1_2_3_CATEGORIES,
  ...WAVE4_CATEGORIES,
  ...WAVE5_CATEGORIES,
] as const;
