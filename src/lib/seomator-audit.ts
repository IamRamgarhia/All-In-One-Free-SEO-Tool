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
  type AuditResult as SeomatorAuditResult,
  type RuleResult,
} from "@seomator/seo-audit";
import type { AuditFinding, Severity } from "./audit";
import {
  effortForPriority,
  priorityForIssue,
  type ActionPriority,
} from "@/lib/cabinet/priority";
import {
  categoryLabel,
  extractCwv,
  extractScoreCap,
  ruleDisplayName,
  ruleFix,
  type CwvSnapshot,
  type ScoreCapInfo,
} from "@/lib/seomator-meta";

export type SeomatorFinding = AuditFinding & {
  category: string;
  fixSteps: string | null;
  confidence: "definitely" | "probably" | "test";
  ruleName: string;
};

export type CategoryScoreMap = Record<
  string,
  { score: number; pass: number; warn: number; fail: number }
>;

export type SeomatorBridgeResult = {
  url: string;
  score: number;
  pagesCrawled: number;
  findings: SeomatorFinding[];
  /** Short markdown: score + per-category breakdown for the audit row. */
  summary: string;
  categoryScores: CategoryScoreMap;
  /** Start-page CWV metrics when Playwright measured them. */
  cwv: CwvSnapshot | null;
  scoreCap: ScoreCapInfo | null;
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

function fixStepsOf(result: RuleResult, ruleId: string): string {
  const fromDetails =
    typeof result.details?.fix === "string" ? result.details.fix : null;
  return ruleFix(ruleId, fromDetails);
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
        ruleName: ruleDisplayName(rule.ruleId),
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
      `| ${categoryLabel(c.categoryId)} | ${c.score} | ${c.passCount} | ${c.warnCount} | ${c.failCount} |`,
    );
  }
  const scoreCap = extractScoreCap(result);
  if (scoreCap) {
    lines.push(
      "",
      `Score capped at ${result.overallScore} (uncapped ${scoreCap.uncappedScore}): ${scoreCap.reasons.join("; ")}`,
    );
  }

  const categoryScores: CategoryScoreMap = {};
  for (const c of result.categoryResults) {
    categoryScores[c.categoryId] = {
      score: c.score,
      pass: c.passCount,
      warn: c.warnCount,
      fail: c.failCount,
    };
  }

  return {
    url: result.url,
    score: result.overallScore,
    pagesCrawled: result.crawledPages,
    findings,
    summary: lines.join("\n"),
    categoryScores,
    cwv: extractCwv(result),
    scoreCap,
  };
}

export type SeomatorGeneratedTask = {
  type: string;
  title: string;
  description: string;
  whyItMatters: string;
  /** Existing tasks.priority enum. */
  priority: "high" | "medium" | "low";
  /** Cabinet-style plan priority, prefixed on the title. */
  planPriority: ActionPriority;
  toolPath: string | null;
};

function taskPriorityFromPlan(p: ActionPriority): "high" | "medium" | "low" {
  switch (p) {
    case "P0":
    case "P1":
      return "high";
    case "P2":
      return "medium";
    case "P3":
      return "low";
    default: {
      const _exhaustive: never = p;
      return _exhaustive;
    }
  }
}

/**
 * Turn the worst SEOmator findings into tasks on the existing /tasks board.
 * Capped and one-per-rule. Agent does not auto-fix `seomator:*` types.
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

  const ranked = Array.from(byType.entries()).map(([type, group]) => {
    const sample = group[0]!;
    const ruleId = type.startsWith("seomator:")
      ? type.slice("seomator:".length)
      : type;
    const planPriority = priorityForIssue({
      ruleId,
      category: sample.category,
      severity: sample.severity,
      status: sample.severity === "critical" || sample.severity === "high"
        ? "fail"
        : "warn",
    });
    return { type, group, sample, planPriority };
  });

  const order: Record<ActionPriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };
  ranked.sort(
    (a, b) => order[a.planPriority] - order[b.planPriority],
  );

  const tasks: SeomatorGeneratedTask[] = [];
  for (const { type, group, sample, planPriority } of ranked) {
    if (tasks.length >= limit) break;
    const where =
      group.length === 1
        ? sample.url
        : `${group.length} pages (e.g. ${sample.url})`;
    const effort = effortForPriority(planPriority);
    tasks.push({
      type,
      title: `[${planPriority}] ${sample.ruleName}: fix on ${where}`,
      description: [
        sample.message,
        sample.fixSteps,
        `Effort estimate: ${effort}. Source: SEOmator rule.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      whyItMatters:
        "SEOmator technical audit (373 rules). High-severity issues block crawlability, indexability or trust — fix before content work.",
      priority: taskPriorityFromPlan(planPriority),
      planPriority,
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
