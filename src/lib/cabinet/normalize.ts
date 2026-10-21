/**
 * Map a SEOmator AuditResult into cabinet issue rows + rule history.
 */

import type { AuditResult as SeomatorAuditResult } from "@seomator/seo-audit";
import { getRuleById } from "@seomator/seo-audit";

export type NormalizedIssue = {
  ruleId: string;
  category: string;
  status: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string | null;
  affectedUrls: string[];
};

export type NormalizedHistory = {
  ruleId: string;
  status: string;
  score: number;
};

export type NormalizedAudit = {
  globalScore: number;
  pagesCrawled: number;
  categoryScores: Record<
    string,
    { score: number; pass: number; warn: number; fail: number }
  >;
  issues: NormalizedIssue[];
  history: NormalizedHistory[];
  /** Best status per rule across pages (fail > warn > pass). */
  ruleStatusMap: Record<string, string>;
  rawReport: Record<string, unknown>;
};

const STATUS_RANK: Record<string, number> = {
  fail: 3,
  warn: 2,
  pass: 1,
  "not-measured": 0,
};

function severityFor(status: string, category: string): string {
  if (status !== "fail" && status !== "warn") return "low";
  if (status === "fail") {
    if (["core", "security", "technical", "crawl"].includes(category)) {
      return "critical";
    }
    return "high";
  }
  if (["core", "security", "technical", "crawl"].includes(category)) {
    return "medium";
  }
  return "low";
}

export function normalizeSeomatorReport(
  result: SeomatorAuditResult,
): NormalizedAudit {
  const categoryScores: NormalizedAudit["categoryScores"] = {};
  const issueBuckets = new Map<string, NormalizedIssue>();
  const history: NormalizedHistory[] = [];
  const ruleStatusMap: Record<string, string> = {};

  for (const cat of result.categoryResults) {
    categoryScores[cat.categoryId] = {
      score: cat.score,
      pass: cat.passCount,
      warn: cat.warnCount,
      fail: cat.failCount,
    };

    for (const rule of cat.results) {
      const pageUrl =
        typeof rule.details?.pageUrl === "string"
          ? rule.details.pageUrl
          : result.url;

      const prevRank = STATUS_RANK[ruleStatusMap[rule.ruleId] ?? ""] ?? -1;
      const nextRank = STATUS_RANK[rule.status] ?? 0;
      if (nextRank >= prevRank) {
        ruleStatusMap[rule.ruleId] = rule.status;
      }

      history.push({
        ruleId: rule.ruleId,
        status: rule.status,
        score: rule.score,
      });

      if (rule.status !== "fail" && rule.status !== "warn") continue;

      const key = `${rule.ruleId}::${rule.status}`;
      const existing = issueBuckets.get(key);
      const meta = getRuleById(rule.ruleId);
      const fix =
        typeof rule.details?.fix === "string" ? rule.details.fix : null;

      if (existing) {
        if (!existing.affectedUrls.includes(pageUrl)) {
          existing.affectedUrls.push(pageUrl);
        }
      } else {
        issueBuckets.set(key, {
          ruleId: rule.ruleId,
          category: cat.categoryId,
          status: rule.status,
          severity: severityFor(rule.status, cat.categoryId),
          title: meta?.name ?? rule.ruleId,
          description: rule.message,
          recommendation: fix ?? meta?.description ?? null,
          affectedUrls: [pageUrl],
        });
      }
    }
  }

  // Collapse history to one row per rule (worst status wins for score too).
  const historyByRule = new Map<string, NormalizedHistory>();
  for (const h of history) {
    const prev = historyByRule.get(h.ruleId);
    if (!prev || (STATUS_RANK[h.status] ?? 0) >= (STATUS_RANK[prev.status] ?? 0)) {
      historyByRule.set(h.ruleId, h);
    }
  }

  return {
    globalScore: result.overallScore,
    pagesCrawled: result.crawledPages,
    categoryScores,
    issues: Array.from(issueBuckets.values()),
    history: Array.from(historyByRule.values()),
    ruleStatusMap,
    rawReport: result as unknown as Record<string, unknown>,
  };
}
