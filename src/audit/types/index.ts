/**
 * Native audit engine types (Wave 1+).
 *
 * Isolated from the legacy crawler in `src/lib/audit.ts` and from the
 * temporary `@seomator/seo-audit` bridge. Designed so SEOmator expertise
 * can be ported rule-by-rule without coupling to that package.
 */

import type { CheerioAPI } from "cheerio";

export type RuleSeverity = "critical" | "high" | "medium" | "low" | "info";

/** SEOmator used `not-measured`; we use `unmeasured` as specified. */
export type RuleStatus = "pass" | "warn" | "fail" | "unmeasured";

export type HttpResponse = {
  url: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  redirected: boolean;
  redirectChain: string[];
  timingMs: number;
};

export type LinkInfo = {
  href: string;
  text: string;
  isInternal: boolean;
  isNoFollow: boolean;
};

export type CrawledPage = {
  url: string;
  finalUrl: string;
  status: number;
  rawHtml: string;
  renderedHtml?: string;
  headers: Record<string, string>;
  redirectChain: string[];
  timingMs: number;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  h1s: string[];
  links: LinkInfo[];
  depth: number;
  wordCount: number;
  fetchedAt: Date;
  error?: string;
};

export type CrawlResult = {
  startUrl: string;
  pages: CrawledPage[];
  /** url → inbound internal URLs */
  inbound: Map<string, string[]>;
  /** url → depth from start */
  depth: Map<string, number>;
  robotsTxt: string | null;
  sitemapUrls: string[];
  blockedByRobots: string[];
};

export type AuditConfig = {
  mode: "quick" | "full";
  maxPages: number;
  concurrency: number;
  /** Playwright render — off by default (quick stays fast). */
  render: boolean;
  measureCwv: boolean;
  respectRobots: boolean;
  timeoutMs: number;
  categories?: string[];
};

export type SiteRef = {
  id: number;
  name: string;
  url: string;
};

export type AuditContext = {
  site: SiteRef;
  url: string;
  rawHtml: string;
  renderedHtml?: string;
  response: HttpResponse;
  page: CrawledPage;
  crawl?: CrawlResult;
  config: AuditConfig;
  $: CheerioAPI;
};

export type RuleResult = {
  status: RuleStatus;
  score?: number;
  message: string;
  affectedUrls?: string[];
  details?: Record<string, unknown>;
  /** Copied from rule at run time for scoring. */
  weight?: number;
  ruleId?: string;
};

export type AuditRule = {
  id: string;
  category: string;
  severity: RuleSeverity;
  weight: number;
  title: string;
  description: string;
  recommendation: string;
  requiresCrawl?: boolean;
  requiresRendering?: boolean;
  check: (context: AuditContext) => Promise<RuleResult>;
};

export type CategoryDefinition = {
  id: string;
  name: string;
  description: string;
  /** Weight as percent of overall score (subset renormalized at score time). */
  weight: number;
};

export type CategoryScore = {
  categoryId: string;
  score: number;
  pass: number;
  warn: number;
  fail: number;
  unmeasured: number;
  results: Array<
    RuleResult & { ruleId: string; title: string; severity: RuleSeverity }
  >;
};

export type ScoreCap = {
  id: string;
  ceiling: number;
  reason: string;
};

export type ScoreResult = {
  globalScore: number;
  uncappedScore: number;
  caps: ScoreCap[];
  categories: CategoryScore[];
};

export type AuditIssue = {
  ruleId: string;
  category: string;
  severity: RuleSeverity;
  status: RuleStatus;
  title: string;
  description: string;
  recommendation: string;
  affectedUrls: string[];
  details?: Record<string, unknown>;
};

export type AuditRunResult = {
  url: string;
  mode: "quick" | "full";
  pagesCrawled: number;
  score: ScoreResult;
  issues: AuditIssue[];
  /** Best status per rule across pages (fail > warn > pass > unmeasured). */
  ruleStatusMap: Record<string, RuleStatus>;
  startedAt: Date;
  finishedAt: Date;
};

export type RuleDiffResult = {
  fixedRules: string[];
  regressedRules: string[];
  worsenedRules: string[];
  newIssues: string[];
};
