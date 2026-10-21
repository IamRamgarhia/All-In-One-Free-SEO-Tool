import { crawlSite } from "@/audit/crawler/crawler";
import { loadCheerio } from "@/audit/crawler/page-parse";
import { WAVE1_CATEGORIES } from "@/audit/engine/categories";
import { diffRuleStatuses } from "@/audit/engine/diff-engine";
import {
  buildCategoryScores,
  computeScoreCaps,
  finalizeScore,
} from "@/audit/engine/score-calculator";
import { resetCrossPageState, getAllRules } from "@/audit/engine/rule-registry";
import { runRules } from "@/audit/engine/rule-runner";
import { ensureWave1RulesRegistered } from "@/audit/rules/register-wave1";
import type {
  AuditConfig,
  AuditIssue,
  AuditRunResult,
  RuleStatus,
  SiteRef,
} from "@/audit/types";

const STATUS_RANK: Record<RuleStatus, number> = {
  fail: 3,
  warn: 2,
  pass: 1,
  unmeasured: 0,
};

export type RunNativeAuditInput = {
  site: SiteRef;
  config?: Partial<AuditConfig>;
};

export function defaultAuditConfig(
  partial: Partial<AuditConfig> = {},
): AuditConfig {
  const mode = partial.mode ?? "quick";
  return {
    mode,
    maxPages: partial.maxPages ?? (mode === "quick" ? 1 : 25),
    concurrency: partial.concurrency ?? 3,
    render: partial.render ?? false,
    measureCwv: partial.measureCwv ?? false,
    respectRobots: partial.respectRobots ?? true,
    timeoutMs: partial.timeoutMs ?? 20_000,
    categories: partial.categories ?? [...WAVE1_CATEGORIES],
  };
}

/**
 * Run the native audit engine (Wave 1 categories).
 * Quick = HTML-only, usually 1 page. Full = multi-page crawl, still no Playwright by default.
 */
export async function runNativeAudit(
  input: RunNativeAuditInput,
): Promise<AuditRunResult> {
  const startedAt = new Date();
  const config = defaultAuditConfig(input.config);
  ensureWave1RulesRegistered();
  resetCrossPageState();

  const crawl = await crawlSite({
    startUrl: input.site.url,
    maxPages: config.maxPages,
    concurrency: config.concurrency,
    respectRobots: config.respectRobots,
    timeoutMs: config.timeoutMs,
  });

  const activeCats = new Set(
    config.categories ?? [...WAVE1_CATEGORIES],
  );
  const rules = getAllRules().filter((r) => activeCats.has(r.category));

  // Aggregate worst status per rule across pages.
  const worstByRule = new Map<
    string,
    { status: RuleStatus; message: string; weight?: number; details?: Record<string, unknown>; urls: string[] }
  >();

  let startCapsContext = null as Awaited<ReturnType<typeof buildPageContext>> | null;

  for (const page of crawl.pages) {
    if (page.error && !page.rawHtml) continue;
    const ctx = buildPageContext({
      site: input.site,
      page,
      crawl,
      config,
    });
    if (!startCapsContext) startCapsContext = ctx;

    const results = await runRules(rules, ctx);
    for (const r of results) {
      const prev = worstByRule.get(r.ruleId);
      const urls = new Set(prev?.urls ?? []);
      if (r.status === "fail" || r.status === "warn") urls.add(page.finalUrl);
      if (
        !prev ||
        (STATUS_RANK[r.status] ?? 0) > (STATUS_RANK[prev.status] ?? 0)
      ) {
        worstByRule.set(r.ruleId, {
          status: r.status,
          message: r.message,
          weight: r.weight,
          details: r.details,
          urls: Array.from(urls),
        });
      } else {
        worstByRule.set(r.ruleId, { ...prev, urls: Array.from(urls) });
      }
    }
  }

  const resultsByRule = new Map(
    Array.from(worstByRule.entries()).map(([ruleId, v]) => [
      ruleId,
      {
        ruleId,
        status: v.status,
        message: v.message,
        weight: v.weight,
        details: v.details,
        affectedUrls: v.urls,
      },
    ]),
  );

  const categories = buildCategoryScores(rules, resultsByRule);
  const pageResults = Array.from(resultsByRule.values());
  const caps = startCapsContext
    ? computeScoreCaps(startCapsContext, pageResults)
    : [];
  const score = finalizeScore(categories, caps);

  const issues: AuditIssue[] = [];
  for (const rule of rules) {
    const r = resultsByRule.get(rule.id);
    if (!r || (r.status !== "fail" && r.status !== "warn")) continue;
    issues.push({
      ruleId: rule.id,
      category: rule.category,
      severity: rule.severity,
      status: r.status,
      title: rule.title,
      description: r.message,
      recommendation: rule.recommendation,
      affectedUrls: r.affectedUrls ?? [],
      details: r.details,
    });
  }

  const ruleStatusMap: Record<string, RuleStatus> = {};
  for (const [id, r] of resultsByRule) {
    ruleStatusMap[id] = r.status;
  }

  return {
    url: input.site.url,
    mode: config.mode,
    pagesCrawled: crawl.pages.length,
    score,
    issues,
    ruleStatusMap,
    startedAt,
    finishedAt: new Date(),
  };
}

function buildPageContext(input: {
  site: SiteRef;
  page: import("@/audit/types").CrawledPage;
  crawl: import("@/audit/types").CrawlResult;
  config: AuditConfig;
}) {
  const { site, page, crawl, config } = input;
  return {
    site,
    url: page.url,
    rawHtml: page.rawHtml,
    renderedHtml: page.renderedHtml,
    response: {
      url: page.url,
      finalUrl: page.finalUrl,
      status: page.status,
      headers: page.headers,
      redirected: page.redirectChain.length > 0 || page.url !== page.finalUrl,
      redirectChain: page.redirectChain,
      timingMs: page.timingMs,
    },
    page,
    crawl,
    config,
    $: loadCheerio(page.rawHtml || "<html></html>"),
  };
}

export { diffRuleStatuses };
