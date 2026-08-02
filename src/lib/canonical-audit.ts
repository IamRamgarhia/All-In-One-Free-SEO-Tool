/**
 * Canonical conflict detector. Crawls a site and flags every page where:
 *
 *   - rel=canonical points to a DIFFERENT URL than the request URL
 *     (legitimate when intentional, but ~half the time is a misconfig)
 *   - canonical points to a 404 / 5xx / redirect
 *   - canonical points off-host (cross-domain canonicals are valid but
 *     usually wrong unless syndicated content)
 *   - canonical conflicts with the meta robots directive
 *   - multiple canonical tags on one page
 *   - canonical tag is missing entirely
 *
 * Also detects "self-canonical mismatch" — common when trailing slash,
 * www, http/https, or capitalization differs.
 */

import { crawlSite } from "./sitemap-generator";
import { guardedFetch } from "./url-guard";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type CanonicalIssue = {
  url: string;
  /** "missing" | "off-host" | "broken-target" | "redirect-target" |
   *  "self-mismatch" | "multiple" | "noindex-conflict" | "ok" */
  kind:
    | "missing"
    | "off-host"
    | "broken-target"
    | "redirect-target"
    | "self-mismatch"
    | "multiple"
    | "noindex-conflict"
    | "ok";
  canonicalUrl: string | null;
  /** Human-readable reason. */
  reason: string;
  /** Severity: critical (broken-target, multiple, noindex-conflict),
   *  high (off-host, redirect-target), medium (self-mismatch), low. */
  severity: "critical" | "high" | "medium" | "low";
};

export type CanonicalAuditResult = {
  ok: boolean;
  pagesChecked: number;
  issues: CanonicalIssue[];
  summary: Record<string, number>;
  error?: string;
};

const HOP_TIMEOUT = 8_000;
const FETCH_TIMEOUT = 10_000;

export async function auditCanonicals(opts: {
  startUrl: string;
  maxPages?: number;
}): Promise<CanonicalAuditResult> {
  const startUrl = opts.startUrl;
  const maxPages = Math.min(opts.maxPages ?? 80, 200);

  let host = "";
  try {
    host = new URL(startUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return empty("Invalid start URL");
  }

  const { pages: crawled } = await crawlSite({
    startUrl,
    maxPages,
    maxDepth: 4,
    respectRobots: true,
  });

  const htmlPages = crawled
    .filter((p) => p.isHtml && p.status >= 200 && p.status < 400)
    .map((p) => p.url)
    .slice(0, maxPages);

  if (htmlPages.length === 0) {
    return empty("Crawl returned no HTML pages.");
  }

  // Fetch each page + extract canonical
  type PageInfo = {
    url: string;
    canonicals: string[];
    metaRobots: string | null;
    status: number;
  };
  const pageData: PageInfo[] = [];
  await Promise.all(
    htmlPages.map(async (u) => {
      const info = await fetchPageInfo(u);
      if (info) pageData.push(info);
    }),
  );

  // Validate each page's canonical
  const issues: CanonicalIssue[] = [];
  const seenCanonicals = new Map<string, string>(); // canonical → first page that claimed it

  for (const p of pageData) {
    if (p.canonicals.length === 0) {
      issues.push({
        url: p.url,
        kind: "missing",
        canonicalUrl: null,
        reason: "No <link rel=\"canonical\"> on the page.",
        severity: "low",
      });
      continue;
    }
    if (p.canonicals.length > 1) {
      issues.push({
        url: p.url,
        kind: "multiple",
        canonicalUrl: p.canonicals[0],
        reason: `${p.canonicals.length} canonical tags found — Google will pick one unpredictably.`,
        severity: "critical",
      });
      continue;
    }
    const canonical = p.canonicals[0];

    // noindex + canonical pointing elsewhere = conflicting signals
    if (p.metaRobots && /noindex/i.test(p.metaRobots) && !sameUrl(p.url, canonical)) {
      issues.push({
        url: p.url,
        kind: "noindex-conflict",
        canonicalUrl: canonical,
        reason:
          "Page is noindex AND points canonical elsewhere — pick ONE strategy. Google ignores canonical on noindex pages.",
        severity: "critical",
      });
      continue;
    }

    let canonicalHost = "";
    try {
      canonicalHost = new URL(canonical).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      issues.push({
        url: p.url,
        kind: "broken-target",
        canonicalUrl: canonical,
        reason: "Canonical URL is malformed.",
        severity: "critical",
      });
      continue;
    }

    if (canonicalHost !== host && !canonicalHost.endsWith(`.${host}`)) {
      issues.push({
        url: p.url,
        kind: "off-host",
        canonicalUrl: canonical,
        reason: `Canonical points off-host to ${canonicalHost}. Valid only for syndicated content.`,
        severity: "high",
      });
      continue;
    }

    // Self-canonical mismatch: same page, different URL form
    if (!sameUrl(p.url, canonical)) {
      // Check if canonical actually returns 200
      const status = await headStatus(canonical);
      if (status === null || status === 0) {
        issues.push({
          url: p.url,
          kind: "broken-target",
          canonicalUrl: canonical,
          reason: "Canonical target didn't respond / DNS failed.",
          severity: "critical",
        });
      } else if (status >= 400) {
        issues.push({
          url: p.url,
          kind: "broken-target",
          canonicalUrl: canonical,
          reason: `Canonical target returns ${status}.`,
          severity: "critical",
        });
      } else if (status >= 300 && status < 400) {
        issues.push({
          url: p.url,
          kind: "redirect-target",
          canonicalUrl: canonical,
          reason: `Canonical target ${status}-redirects — should canonical to the final URL instead.`,
          severity: "high",
        });
      } else {
        issues.push({
          url: p.url,
          kind: "self-mismatch",
          canonicalUrl: canonical,
          reason: "Canonical URL differs from the page URL (different trailing slash / casing / parameters / scheme).",
          severity: "medium",
        });
      }
    }
    seenCanonicals.set(canonical, p.url);
  }

  const summary: Record<string, number> = {};
  for (const i of issues) {
    summary[i.kind] = (summary[i.kind] ?? 0) + 1;
  }

  return {
    ok: true,
    pagesChecked: pageData.length,
    issues,
    summary,
  };
}

function sameUrl(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return (
      ua.hostname.replace(/^www\./i, "") === ub.hostname.replace(/^www\./i, "") &&
      ua.pathname.replace(/\/$/, "") === ub.pathname.replace(/\/$/, "") &&
      ua.search === ub.search &&
      ua.protocol === ub.protocol
    );
  } catch {
    return false;
  }
}

async function fetchPageInfo(url: string): Promise<{
  url: string;
  canonicals: string[];
  metaRobots: string | null;
  status: number;
} | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const res = await guardedFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 600_000);
    const canonicals: string[] = [];
    for (const m of html.matchAll(
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/gi,
    )) {
      try {
        canonicals.push(new URL(m[1], res.url).toString());
      } catch {
        canonicals.push(m[1]);
      }
    }
    const metaRobots = html.match(
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i,
    )?.[1] ?? null;
    return {
      url: res.url,
      canonicals,
      metaRobots,
      status: res.status,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function headStatus(url: string): Promise<number | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), HOP_TIMEOUT);
  try {
    const res = await guardedFetch(url, {
      method: "HEAD",
      headers: { "user-agent": USER_AGENT },
      signal: ac.signal,
      redirect: "manual",
    });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function empty(error: string): CanonicalAuditResult {
  return { ok: false, pagesChecked: 0, issues: [], summary: {}, error };
}
