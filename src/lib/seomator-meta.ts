/**
 * SEOmator metadata helpers for SEO-Tool surfaces.
 *
 * The npm package exports the rule registry and category weights; the app
 * uses them for labels, CWV readout, and verdicts — without cloning
 * SEOmator's Electron/CLI UI.
 */

import {
  categories,
  getCategoryById,
  getRuleById,
  scoreToVerdict,
  type AuditResult as SeomatorAuditResult,
  type CoreWebVitals,
} from "@seomator/seo-audit";
import { getFixSuggestion } from "@/lib/seomator-fix-suggestions";

export type CategoryMeta = {
  id: string;
  name: string;
  description: string;
  weight: number;
};

/** All 20 SEOmator categories with display names + score weights. */
export function seomatorCategories(): CategoryMeta[] {
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    weight: c.weight,
  }));
}

export function categoryLabel(categoryId: string): string {
  return getCategoryById(categoryId)?.name ?? categoryId;
}

export function categoryWeight(categoryId: string): number {
  return getCategoryById(categoryId)?.weight ?? 0;
}

export function ruleDisplayName(ruleId: string): string {
  return getRuleById(ruleId)?.name ?? ruleId;
}

export function ruleFix(ruleId: string, detailsFix?: string | null): string {
  if (typeof detailsFix === "string" && detailsFix.trim()) return detailsFix.trim();
  const fromMap = getFixSuggestion(ruleId);
  if (fromMap && !fromMap.includes("SEO best practices")) return fromMap;
  const desc = getRuleById(ruleId)?.description;
  return desc ?? fromMap;
}

export function verdictForScore(score: number) {
  return scoreToVerdict(score);
}

const CWV_RULES = [
  "cwv-lcp",
  "cwv-cls",
  "cwv-inp",
  "cwv-ttfb",
  "cwv-fcp",
] as const;

export type CwvSnapshot = {
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  fcp: number | null;
  statuses: Record<string, string>;
};

/**
 * Pull CWV numbers out of a stored SEOmator AuditResult.
 * Crawl runs still emit per-rule metric details on the start page.
 */
export function extractCwv(
  raw: SeomatorAuditResult | Record<string, unknown> | null | undefined,
): CwvSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const categoryResults = (raw as SeomatorAuditResult).categoryResults;
  if (!Array.isArray(categoryResults)) return null;

  const out: CwvSnapshot = {
    lcp: null,
    cls: null,
    inp: null,
    ttfb: null,
    fcp: null,
    statuses: {},
  };
  let found = false;

  for (const cat of categoryResults) {
    for (const rule of cat.results ?? []) {
      if (!CWV_RULES.includes(rule.ruleId as (typeof CWV_RULES)[number])) continue;
      found = true;
      out.statuses[rule.ruleId] = rule.status;
      const value = rule.details?.value;
      if (typeof value !== "number") continue;
      switch (rule.ruleId) {
        case "cwv-lcp":
          out.lcp = value;
          break;
        case "cwv-cls":
          out.cls = value;
          break;
        case "cwv-inp":
          out.inp = value;
          break;
        case "cwv-ttfb":
          out.ttfb = value;
          break;
        case "cwv-fcp":
          out.fcp = value;
          break;
        default:
          break;
      }
    }
  }

  return found ? out : null;
}

/** Categories for a faster pass — still SEOmator, same storage path. */
export const QUICK_AUDIT_CATEGORIES = [
  "core",
  "technical",
  "security",
  "crawl",
  "perf",
] as const;

export type ScoreCapInfo = {
  uncappedScore: number;
  reasons: string[];
};

export function extractScoreCap(
  raw: SeomatorAuditResult | Record<string, unknown> | null | undefined,
): ScoreCapInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const cap = (raw as SeomatorAuditResult).scoreCap;
  if (!cap) return null;
  return {
    uncappedScore: cap.uncappedScore,
    reasons: (cap.caps ?? []).map((c) => c.reason),
  };
}

export function extractWaivedCaps(
  raw: SeomatorAuditResult | Record<string, unknown> | null | undefined,
): string[] {
  if (!raw || typeof raw !== "object") return [];
  const waived = (raw as SeomatorAuditResult).waivedCaps;
  if (!Array.isArray(waived)) return [];
  return waived.map((c) => c.reason);
}

/** Re-export for callers that need the type without importing the package. */
export type { CoreWebVitals };
