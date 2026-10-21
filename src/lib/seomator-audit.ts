/**
 * Bridge from SEOmator's 373-rule audit engine into this app's audit shape.
 *
 * The built-in crawler (~72 finding types) is still useful for the agent
 * (it knows how to fix those types) and for a fast smoke pass. SEOmator
 * is the deep technical audit: Core Web Vitals, security headers,
 * crawlability, a11y, schema, GEO/llms.txt, JS rendering, and the rest.
 *
 * Findings land in the same `audits` / `audit_issues` tables with
 * `kind = "seomator"`. Downstream planners that only understand crawler
 * types keep filtering on `kind = "crawler"`, so this never hides a
 * crawl or invents agent work the executor cannot do.
 */

import {
  createAuditor,
  getRuleById,
  type AuditResult as SeomatorAuditResult,
  type RuleResult,
} from "@seomator/seo-audit";
import type { AuditFinding, Severity } from "./audit";

export type SeomatorFinding = AuditFinding & {
  category: string;
  fixSteps: string | null;
  confidence: "definitely" | "probably" | "test";
  ruleName: string;
};

export type SeomatorBridgeResult = {
  url: string;
  score: number;
  pagesCrawled: number;
  findings: SeomatorFinding[];
  /** Short markdown: score + per-category breakdown for the audit row. */
  summary: string;
  /** Raw SEOmator payload for debugging / future compare UI. */
  raw: SeomatorAuditResult;
};

export type RunSeomatorAuditOptions = {
  /** Crawl multiple pages (default true). */
  crawl?: boolean;
  maxPages?: number;
  concurrency?: number;
  /** Core Web Vitals via Playwright (default true). */
  measureCwv?: boolean;
  /** Limit to category ids, e.g. ["core","security","perf"]. Empty = all. */
  categories?: string[];
  timeoutMs?: number;
  onPageComplete?: (url: string, pageNumber: number, totalPages: number) => void;
  onCrawlProgress?: (crawled: number) => void;
};

const CRITICAL_CATEGORIES = new Set(["core", "security", "technical", "crawl"]);

function severityFor(
  status: RuleResult["status"],
  categoryId: string,
): Severity | null {
  if (status === "pass" || status === "not-measured") return null;
  if (status === "fail") {
    return CRITICAL_CATEGORIES.has(categoryId) ? "critical" : "high";
  }
  // warn
  return CRITICAL_CATEGORIES.has(categoryId) ? "medium" : "low";
}

function pageUrlOf(result: RuleResult, fallback: string): string {
  const raw = result.details?.pageUrl;
  return typeof raw === "string" && raw.length > 0 ? raw : fallback;
}

function fixStepsOf(result: RuleResult, ruleId: string): string | null {
  const fix = result.details?.fix;
  if (typeof fix === "string" && fix.trim()) return fix.trim();
  const rule = getRuleById(ruleId);
  if (rule?.description) return rule.description;
  return null;
}

function ruleNameOf(ruleId: string): string {
  return getRuleById(ruleId)?.name ?? ruleId;
}

/**
 * Map a finished SEOmator AuditResult into findings this app can store.
 * Exported so unit tests can assert mapping without a network crawl.
 */
export function mapSeomatorResult(
  result: SeomatorAuditResult,
): Omit<SeomatorBridgeResult, "raw"> {
  const findings: SeomatorFinding[] = [];
  const seen = new Set<string>();

  for (const category of result.categoryResults) {
    for (const rule of category.results) {
      const severity = severityFor(rule.status, category.categoryId);
      if (!severity) continue;

      const url = pageUrlOf(rule, result.url);
      // Dedupe identical (rule, url, status) across crawl aggregation noise.
      const key = `${rule.ruleId}::${url}::${rule.status}`;
      if (seen.has(key)) continue;
      seen.add(key);

      findings.push({
        type: `seomator:${rule.ruleId}`,
        severity,
        message: rule.message,
        url,
        category: category.categoryId,
        fixSteps: fixStepsOf(rule, rule.ruleId),
        confidence: rule.status === "fail" ? "definitely" : "probably",
        ruleName: ruleNameOf(rule.ruleId),
      });
    }
  }

  const severityRank: Record<Severity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  findings.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );

  const lines = [
    `SEOmator deep audit — score ${result.overallScore}/100 across ${result.crawledPages} page(s).`,
    "",
    "| Category | Score | Pass | Warn | Fail |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const c of result.categoryResults) {
    lines.push(
      `| ${c.categoryId} | ${c.score} | ${c.passCount} | ${c.warnCount} | ${c.failCount} |`,
    );
  }
  if (result.scoreCap) {
    lines.push(
      "",
      `Score capped at ${result.overallScore} (uncapped ${result.scoreCap.uncappedScore}): ${result.scoreCap.caps.map((c) => c.reason).join("; ")}`,
    );
  }

  return {
    url: result.url,
    score: result.overallScore,
    pagesCrawled: result.crawledPages,
    findings,
    summary: lines.join("\n"),
  };
}

export type SeomatorGeneratedTask = {
  type: string;
  title: string;
  description: string;
  whyItMatters: string;
  priority: "high" | "medium" | "low";
  toolPath: string | null;
};

/**
 * Turn the worst SEOmator findings into tasks. Capped and one-per-rule so a
 * 373-rule fail storm does not flood the board. The agent does not auto-fix
 * these (types are `seomator:*`); they are for the human review queue.
 */
export function seomatorFindingsToTasks(
  findings: SeomatorFinding[],
  limit = 25,
): SeomatorGeneratedTask[] {
  const actionable = findings.filter(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  const byType = new Map<string, SeomatorFinding[]>();
  for (const f of actionable) {
    const list = byType.get(f.type) ?? [];
    list.push(f);
    byType.set(f.type, list);
  }

  const tasks: SeomatorGeneratedTask[] = [];
  for (const [type, group] of byType) {
    if (tasks.length >= limit) break;
    const sample = group[0]!;
    const where =
      group.length === 1
        ? sample.url
        : `${group.length} pages (e.g. ${sample.url})`;
    tasks.push({
      type,
      title: `${sample.ruleName}: fix on ${where}`,
      description: [sample.message, sample.fixSteps]
        .filter(Boolean)
        .join("\n\n"),
      whyItMatters:
        "Flagged by the SEOmator deep technical audit (373 rules). Fixing high-severity technical issues protects crawlability, indexability and trust signals.",
      priority: sample.severity === "critical" ? "high" : "medium",
      toolPath: "/audits",
    });
  }
  return tasks;
}

/**
 * Run a SEOmator audit against a live URL.
 */
export async function runSeomatorAudit(
  url: string,
  options: RunSeomatorAuditOptions = {},
): Promise<SeomatorBridgeResult> {
  const crawl = options.crawl ?? true;
  const maxPages = options.maxPages ?? 20;
  const concurrency = options.concurrency ?? 3;
  const measureCwv = options.measureCwv ?? true;

  const auditor = createAuditor({
    measureCwv,
    timeout: options.timeoutMs ?? 30_000,
    categories: options.categories ?? [],
    onPageComplete: options.onPageComplete,
    onCrawlProgress: options.onCrawlProgress
      ? (progress) => {
          if (progress.crawled > 0) options.onCrawlProgress?.(progress.crawled);
        }
      : undefined,
  });

  const raw = crawl
    ? await auditor.auditWithCrawl(url, maxPages, concurrency)
    : await auditor.audit(url);

  const mapped = mapSeomatorResult(raw);
  return { ...mapped, raw };
}
