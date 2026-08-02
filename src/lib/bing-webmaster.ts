/**
 * Bing Webmaster Tools API — free, requires only an API key the user
 * generates in https://www.bing.com/webmasters → Settings → API access.
 *
 * Docs: https://learn.microsoft.com/en-us/bingwebmaster/
 *
 * We use the JSON endpoints (svc=json). Keys live in our settings store
 * under `bing.api_key` so users add it once at the workspace level.
 */

import { getSetting } from "./settings-store";

const BASE = "https://ssl.bing.com/webmaster/api.svc/json";

export async function getBingApiKey(): Promise<string | null> {
  return (await getSetting<string>("bing.api_key")) ?? null;
}

async function bingFetch<T>(
  endpoint: string,
  params: Record<string, string | number>,
): Promise<T> {
  const key = await getBingApiKey();
  if (!key) throw new Error("Bing API key not configured");
  const qs = new URLSearchParams({ apikey: key });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${BASE}/${endpoint}?${qs.toString()}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bing ${endpoint} failed: ${res.status} ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type BingSite = {
  Url: string;
  IsVerified: boolean;
};

export async function listBingSites(): Promise<BingSite[]> {
  type R = { d: BingSite[] | null };
  const data = await bingFetch<R>("GetUserSites", {});
  return data.d ?? [];
}

export type BingQueryStat = {
  Query: string;
  /** Avg position over the period (1-based, lower is better). */
  AvgImpressionPosition: number;
  /** Avg click-through position. */
  AvgClickPosition: number;
  Clicks: number;
  Impressions: number;
};

/**
 * Top queries the user's site received from Bing search over the last
 * 6 months (Bing's default window). Used in dashboards alongside GSC.
 */
export async function getBingTopQueries(opts: {
  siteUrl: string;
}): Promise<BingQueryStat[]> {
  type R = { d: BingQueryStat[] | null };
  const data = await bingFetch<R>("GetQueryStats", {
    siteUrl: opts.siteUrl,
  });
  return data.d ?? [];
}

export type BingPageStat = {
  Page: string;
  Clicks: number;
  Impressions: number;
  AvgImpressionPosition: number;
};

export async function getBingTopPages(opts: {
  siteUrl: string;
}): Promise<BingPageStat[]> {
  type R = { d: BingPageStat[] | null };
  const data = await bingFetch<R>("GetPageStats", {
    siteUrl: opts.siteUrl,
  });
  return data.d ?? [];
}

export type BingCrawlIssue = {
  Url: string;
  HttpCode: number;
  IssueType: number;
  IssueLevel: number;
  CrawledDate: string;
};

export async function getBingCrawlIssues(opts: {
  siteUrl: string;
}): Promise<BingCrawlIssue[]> {
  type R = { d: BingCrawlIssue[] | null };
  const data = await bingFetch<R>("GetCrawlIssues", {
    siteUrl: opts.siteUrl,
  });
  return data.d ?? [];
}

/**
 * Submit URLs to Bing for indexing. Bing has a daily quota per site (the
 * UI shows your remaining quota). Returns d=null on success.
 */
export async function bingSubmitUrlBatch(opts: {
  siteUrl: string;
  urlList: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const key = await getBingApiKey();
  if (!key) return { ok: false, error: "Bing API key not configured" };
  const url = `${BASE}/SubmitUrlbatch?apikey=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        accept: "application/json",
      },
      body: JSON.stringify({
        siteUrl: opts.siteUrl,
        urlList: opts.urlList,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `${res.status} ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export type BingQuota = {
  DailyQuota: number;
  MonthlyQuota: number;
};

export async function getBingUrlSubmissionQuota(opts: {
  siteUrl: string;
}): Promise<BingQuota | null> {
  try {
    type R = { d: BingQuota | null };
    const data = await bingFetch<R>("GetUrlSubmissionQuota", {
      siteUrl: opts.siteUrl,
    });
    return data.d ?? null;
  } catch {
    return null;
  }
}

// =====================================================================
// Backlinks
// =====================================================================

/**
 * Backlinks from Bing Webmaster Tools.
 *
 * This is the most valuable free backlink source available to a
 * self-hosted tool, and CLAUDE.md is blunt that backlinks are this
 * project's weakest data: we don't have an index, Common Crawl
 * extraction is thin, and the README says so plainly rather than
 * implying parity with Ahrefs.
 *
 * Bing changes that materially for one specific case — a site the user
 * has verified in Bing Webmaster Tools. Microsoft hands over their own
 * link graph for it, free, with no quota worth worrying about. It is
 * still only YOUR site's inbound links, so it does nothing for
 * competitor analysis, but "what links to my client" is the question
 * that actually gets asked in a monthly report.
 *
 * Response shapes are handled defensively. The Bing API returns its
 * payload under `d`, sometimes as a bare array and sometimes wrapped in
 * an object, and the casing of individual fields has moved over the
 * years. Everything below tolerates both rather than throwing — a
 * shape change should cost the user some rows, not the whole feature.
 */

export type BingLinkCount = {
  /** A page on the user's site. */
  url: string;
  /** How many inbound links Bing knows about for it. */
  count: number;
};

/**
 * Pull a value regardless of which casing this endpoint used.
 *
 * The case-insensitive pass looks for a key that actually HAS a value,
 * not merely the first key whose name matches. `find()` on the name
 * alone stopped at `Url: undefined` and never reached `url: "y"` — so a
 * payload carrying both casings, one of them empty, silently produced
 * nothing. Caught by its own test.
 */
function pick(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (obj[n] !== undefined && obj[n] !== null) return obj[n];
    const target = n.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() !== target) continue;
      if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    }
  }
  return undefined;
}

/** `d` is sometimes an array and sometimes `{ Links: [...] }`. */
function unwrap(d: unknown): unknown[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const key of ["Links", "links", "Results", "results"]) {
      const v = (d as Record<string, unknown>)[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/**
 * Which of the user's pages have inbound links, and how many.
 *
 * The entry point for an import: Bing won't hand over every link in one
 * call, so we ask which pages are worth asking about and then fetch the
 * details for the ones that matter.
 */
export async function getBingLinkCounts(opts: {
  siteUrl: string;
  page?: number;
}): Promise<BingLinkCount[]> {
  type R = { d: unknown };
  const data = await bingFetch<R>("GetLinkCounts", {
    siteUrl: opts.siteUrl,
    page: opts.page ?? 0,
  });

  return unwrap(data.d)
    .map((row) => {
      const r = row as Record<string, unknown>;
      const url = pick(r, "Url", "url", "TargetUrl");
      const count = pick(r, "Count", "count", "LinkCount");
      return {
        url: typeof url === "string" ? url : "",
        count: Number(count) || 0,
      };
    })
    .filter((r) => r.url.length > 0);
}

export type BingInboundLink = {
  /** The page linking TO the user's site. */
  sourceUrl: string;
  anchorText: string | null;
};

/**
 * The individual pages linking to one URL on the user's site.
 *
 * `page` is Bing's zero-based pagination. Callers walk it until a call
 * returns nothing.
 */
export async function getBingInboundLinks(opts: {
  siteUrl: string;
  /** A page on the user's site to get inbound links for. */
  targetUrl: string;
  page?: number;
}): Promise<BingInboundLink[]> {
  type R = { d: unknown };
  const data = await bingFetch<R>("GetUrlLinks", {
    siteUrl: opts.siteUrl,
    link: opts.targetUrl,
    page: opts.page ?? 0,
  });

  return unwrap(data.d)
    .map((row) => {
      const r = row as Record<string, unknown>;
      const sourceUrl = pick(r, "Url", "url", "SourceUrl");
      const anchor = pick(r, "AnchorText", "anchorText", "Anchor");
      return {
        sourceUrl: typeof sourceUrl === "string" ? sourceUrl : "",
        anchorText:
          typeof anchor === "string" && anchor.trim().length > 0
            ? anchor.trim()
            : null,
      };
    })
    .filter((r) => r.sourceUrl.length > 0);
}

/** Exposed so the parsing can be fixture-tested without a network call. */
export const __bingParsing = { pick, unwrap };
