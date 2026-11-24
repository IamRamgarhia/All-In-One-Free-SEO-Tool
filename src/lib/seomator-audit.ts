/**
 * The engine's result in this app's audit shape: findings, tasks, the
 * per-category score table.
 *
 * The rules are SEOmator's (373 rules in 20 weighted categories), ported
 * into src/audit and run in-process: no package, no second browser. Their
 * findings are typed `seomator:<rule id>` and sit in the same audit as SEO
 * Tool's own checks; the agent only acts on the types it knows how to fix.
 */

import { toolForAnyFinding } from "./finding-tool-map";
import type {
  AuditResult as SeomatorAuditResult,
  CategoryResult,
  RuleResult,
} from "@/audit";
import { fetchPageWithPlaywright } from "@/audit/crawler/playwright-fetcher";
import { engineTitleFr, engineWhyFr, placeFr } from "./audit-to-task.fr";
import { ruleNamesFr } from "./rule-names.fr";
import { translateEngineMessage } from "@/audit/engine/translate-message";
import { FIX_SUGGESTIONS_FR } from "@/audit/engine/fix-suggestions.fr";
import { getReportLocale } from "./report-i18n";

/** Effort sizes in French (cabinet/priority.ts: S, M, L). */
const EFFORT_FR: Record<string, string> = { S: "faible", M: "moyen", L: "important" };
import type { AuditFinding, Severity } from "./audit";
import { runEngine, type AuditMode } from "@/lib/audit-engine";
import { isAdvisoryFor, type SiteKind } from "./advisory-rules";
import { seoScoreOf } from "./seo-score";

export { seoScoreOf };
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
  /** quick: HTML only. full: browser render, Core Web Vitals, mobile parity. */
  mode: AuditMode;
  /** The client's niche (lib/advisory-rules.ts, isAdvisoryFor). */
  siteKind?: SiteKind | null;
  maxPages?: number;
  allowPrivateHosts?: boolean;
  ignoreRobots?: boolean;
  signal?: AbortSignal;
  onCrawlProgress?: (crawled: number) => void;
  onCategoryStart?: (categoryId: string, categoryName: string) => void;
  onCategoryComplete?: (
    categoryId: string,
    categoryName: string,
    result: CategoryResult,
  ) => void;
  onRuleComplete?: (ruleId: string, ruleName: string) => void;
  /** Absolute path for the first desktop render's screenshot (full mode). */
  previewScreenshotPath?: string;
  /** Fired once after the landing PNG is written. */
  onPreviewScreenshot?: () => void;
};

const CRITICAL_CATEGORIES = new Set(["core", "security", "technical", "crawl"]);

function severityFor(
  status: RuleResult["status"],
  categoryId: string,
): Severity | null {
  if (status !== "fail" && status !== "warn") return null;
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
 * One finding for a fact about the whole site, not one per page.
 *
 * A crawl reads every rule on every page, so a site-wide fact (a missing
 * security header, a sitemap without dates, no llms.txt) came back as the
 * same message on each of the 20 pages: on nd-prestige.com, 498 of 844
 * findings were 25 such facts copied page by page. When a rule gives the
 * very same message on two pages or more, it is one problem: it is kept
 * once, on the site's own URL, with the number of pages it was seen on.
 * A message that differs from page to page ("13 images", "Title is 66
 * chars") is about each page and stays per page.
 *
 * Pure, exported for tests.
 */
export function collapseSiteWide<T extends { type: string; message: string; url: string }>(
  findings: readonly T[],
  siteUrl: string,
): T[] {
  const groups = new Map<string, T[]>();
  for (const f of findings) {
    const key = `${f.type}\u0000${f.message}`;
    const group = groups.get(key);
    if (group) group.push(f);
    else groups.set(key, [f]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    const pages = new Set(group.map((f) => f.url));
    if (pages.size < 2) {
      out.push(...group);
      continue;
    }
    out.push({ ...group[0], url: siteUrl, message: `${group[0].message} (${pages.size} pages)` });
  }
  return out;
}

/**
 * Map a finished SEOmator AuditResult into findings this app can store.
 * Exported so unit tests can assert mapping without a network crawl.
 */
export function mapSeomatorResult(
  result: SeomatorAuditResult,
  /** The client's niche: rules written for other kinds of site are not problems here. */
  kind?: SiteKind | null,
  /** Workspace language: French messages and fixes are stored as such. */
  locale: string = "en",
): Omit<SeomatorBridgeResult, "raw"> {
  const fr = locale === "fr";
  const findings: SeomatorFinding[] = [];
  const seen = new Set<string>();

  for (const category of result.categoryResults) {
    for (const rule of category.results) {
      // Good practice, not ranking: shown on the audit page, not a problem
      // here (lib/advisory-rules.ts).
      if (isAdvisoryFor(rule.ruleId, kind)) continue;
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
        message: fr ? translateEngineMessage(rule.ruleId, rule.message) : rule.message,
        url,
        category: category.categoryId,
        fixSteps: (fr ? FIX_SUGGESTIONS_FR[rule.ruleId] : undefined) ?? fixStepsOf(rule, rule.ruleId),
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
  findings.splice(0, findings.length, ...collapseSiteWide(findings, result.url));
  findings.sort(
    (a, b) => severityRank[a.severity] - severityRank[b.severity],
  );

  const lines = [
    `Technical audit — score ${result.overallScore}/100 across ${result.crawledPages} page(s).`,
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
    score: seoScoreOf(result, kind),
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
  /** The workspace language (audit-to-task.fr.ts for the French texts). */
  locale: "fr" | "en" = "en",
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
    const fr = locale === "fr";
    const where = fr
      ? placeFr(group.map((g) => g.url))
      : group.length === 1
        ? sample.url
        : `${group.length} pages (e.g. ${sample.url})`;
    const effort = effortForPriority(planPriority);
    tasks.push({
      type,
      title: fr
        ? engineTitleFr(planPriority, ruleNamesFr[type.replace(/^seomator:/, "")] ?? sample.ruleName, where)
        : `[${planPriority}] ${sample.ruleName}: fix on ${where}`,
      description: [
        sample.message,
        sample.fixSteps,
        fr ? `Effort estimé : ${EFFORT_FR[effort] ?? effort}.` : `Effort estimate: ${effort}.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      whyItMatters: fr
        ? engineWhyFr
        : "Technical audit rule. High-severity issues block crawlability, indexability or trust — fix before content work.",
      priority: taskPriorityFromPlan(planPriority),
      planPriority,
      // The tool that helps with this rule when there is one
      // (finding-tool-map.ts); the audits otherwise, as before.
      toolPath: toolForAnyFinding(type) ?? "/audits",
    });
  }
  return tasks;
}

/** Run the engine against a live URL and map its result. */
export async function runSeomatorAudit(
  url: string,
  options: RunSeomatorAuditOptions,
): Promise<SeomatorBridgeResult> {
  let previewCaptured = false;
  const raw = await runEngine(url, {
    mode: options.mode,
    maxPages: options.maxPages,
    allowPrivateHosts: options.allowPrivateHosts,
    ignoreRobots: options.ignoreRobots,
    signal: options.signal,
    onCategoryStart: options.onCategoryStart,
    onCategoryComplete: options.onCategoryComplete,
    onRuleComplete: options.onRuleComplete,
    onCrawlProgress: options.onCrawlProgress
      ? (progress) => {
          if (progress.crawled > 0) options.onCrawlProgress?.(progress.crawled);
        }
      : undefined,
    browserFetcher: options.previewScreenshotPath
      ? async (pageUrl, timeout, renderOpts) => {
          const wantPreview = !previewCaptured && !renderOpts?.mobile;
          const result = await fetchPageWithPlaywright(pageUrl, timeout, {
            ...renderOpts,
            ...(wantPreview && { screenshotPath: options.previewScreenshotPath }),
          });
          if (wantPreview) {
            previewCaptured = true;
            options.onPreviewScreenshot?.();
          }
          return result;
        }
      : undefined,
  });

  const mapped = mapSeomatorResult(raw, options.siteKind, await getReportLocale());
  return { ...mapped, raw };
}
