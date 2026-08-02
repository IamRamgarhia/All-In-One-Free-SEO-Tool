/**
 * E-E-A-T audit. Google's quality rater guidelines (and the helpful-content
 * system) reward content that demonstrates Experience, Expertise,
 * Authoritativeness, and Trust. Most are signals you can detect by looking
 * at the page HTML:
 *
 *   - Author byline + bio + qualifications
 *   - Published / updated dates
 *   - Outbound citations to authoritative sources
 *   - Schema (Article, Person, Organization)
 *   - About / contact / privacy / editorial-policy pages
 *   - HTTPS
 *   - Reviewer / fact-checker line
 *   - Original imagery (vs stock)
 *
 * We score each pillar 0-25 (total 0-100) and let the AI write a concrete
 * fix list for what's missing. Free; no paid APIs.
 */

import { callAI } from "./ai-call";
import { guardedFetch } from "./url-guard";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type EeatSignals = {
  hasAuthorByline: boolean;
  authorName: string | null;
  hasAuthorBio: boolean;
  hasAuthorSchema: boolean;
  hasPublishedDate: boolean;
  hasUpdatedDate: boolean;
  publishedDate: string | null;
  updatedDate: string | null;
  outboundCitationCount: number;
  authoritativeCitationCount: number;
  hasArticleSchema: boolean;
  hasOrganizationSchema: boolean;
  hasReviewerLine: boolean;
  hasAboutLink: boolean;
  hasContactLink: boolean;
  hasPrivacyLink: boolean;
  hasEditorialPolicy: boolean;
  hasHttps: boolean;
  imageCount: number;
  /** Count of <img> with alt attributes — proxy for original/described imagery. */
  describedImageCount: number;
};

export type EeatScore = {
  experience: number;
  expertise: number;
  authority: number;
  trust: number;
  total: number;
};

export type EeatResult = {
  url: string;
  signals: EeatSignals;
  score: EeatScore;
  missing: string[];
  brief: string;
  error?: string;
};

/** Authoritative TLDs and known publishers — citations to these count extra. */
const AUTHORITATIVE_HOSTS = [
  ".gov",
  ".edu",
  "wikipedia.org",
  "who.int",
  "nih.gov",
  "ncbi.nlm.nih.gov",
  "nytimes.com",
  "reuters.com",
  "bbc.com",
  "bbc.co.uk",
  "ft.com",
  "theguardian.com",
  "nature.com",
  "sciencedirect.com",
  "harvard.edu",
  "stanford.edu",
  "mit.edu",
];

export async function auditEeat(opts: {
  url: string;
  clientId?: number;
}): Promise<EeatResult> {
  const html = await fetchHtml(opts.url);
  if (!html) {
    return emptyResult(opts.url, "Couldn't fetch the page");
  }

  const signals = extractSignals(html, opts.url);
  const score = scoreSignals(signals);
  const missing = listMissing(signals);
  const brief = await aiBrief({
    url: opts.url,
    signals,
    score,
    missing,
    clientId: opts.clientId,
  });

  return { url: opts.url, signals, score, missing, brief };
}

function extractSignals(html: string, url: string): EeatSignals {
  const lower = html.toLowerCase();
  const isHttps = /^https:\/\//i.test(url);

  // Author byline detection — common patterns: "By X", rel="author",
  // schema.org Person, .author class.
  const byMatch = html.match(/(?:^|>)\s*by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s*(?:<|,|\||$)/m);
  const authorMetaMatch = html.match(
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
  );
  const relAuthorMatch = html.match(
    /<a[^>]+rel=["'][^"']*author[^"']*["'][^>]*>([^<]+)<\/a>/i,
  );
  const authorClassMatch = html.match(
    /<[^>]+class=["'][^"']*\bauthor(?:-name|-byline)?\b[^"']*["'][^>]*>([^<]+)</i,
  );
  const authorName =
    relAuthorMatch?.[1]?.trim() ??
    byMatch?.[1]?.trim() ??
    authorMetaMatch?.[1]?.trim() ??
    authorClassMatch?.[1]?.trim() ??
    null;
  const hasAuthorByline = !!authorName;

  // Bio = a short paragraph near the byline that mentions the author and
  // typically includes "is a", "writes about", "specializes in", credentials.
  const hasAuthorBio =
    /class=["'][^"']*\b(author-bio|bio|about-author)\b/i.test(html) ||
    /\bis\s+a\s+(?:senior|certified|licensed|registered|board-certified|professional|expert|specialist)/i.test(
      html,
    );

  // Author / Person schema
  const hasAuthorSchema =
    /"@type"\s*:\s*"(?:Person|Author)"/i.test(html) ||
    /"author"\s*:\s*\{[^}]*"@type"\s*:\s*"Person"/i.test(html);

  // Dates
  const publishedMatch =
    html.match(
      /<meta[^>]+(?:property|name)=["'](?:article:published_time|datePublished)["'][^>]+content=["']([^"']+)["']/i,
    ) ??
    html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ??
    html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i);
  const updatedMatch =
    html.match(
      /<meta[^>]+(?:property|name)=["'](?:article:modified_time|dateModified)["'][^>]+content=["']([^"']+)["']/i,
    ) ?? html.match(/"dateModified"\s*:\s*"([^"]+)"/i);

  const publishedDate = publishedMatch?.[1] ?? null;
  const updatedDate = updatedMatch?.[1] ?? null;

  // Outbound citations
  let outboundCitationCount = 0;
  let authoritativeCitationCount = 0;
  let pageHost = "";
  try {
    pageHost = new URL(url).hostname;
  } catch {
    // ignore
  }
  for (const m of html.matchAll(
    /<a\s[^>]*href\s*=\s*["']https?:\/\/([^"'/]+)([^"']*)["']/gi,
  )) {
    const host = m[1].toLowerCase();
    if (!host || host === pageHost) continue;
    outboundCitationCount += 1;
    if (AUTHORITATIVE_HOSTS.some((h) => host === h.replace(/^\./, "") || host.endsWith(h))) {
      authoritativeCitationCount += 1;
    }
  }

  const hasArticleSchema =
    /"@type"\s*:\s*"(?:Article|NewsArticle|BlogPosting|MedicalWebPage)"/i.test(
      html,
    );
  const hasOrganizationSchema = /"@type"\s*:\s*"Organization"/i.test(html);

  const hasReviewerLine =
    /\b(?:medically reviewed|fact[- ]checked|reviewed by|edited by)\b/i.test(
      html,
    );

  const hasAboutLink = /<a[^>]+href=["'][^"']*\babout(?:-us)?\b[^"']*["']/i.test(
    lower,
  );
  const hasContactLink = /<a[^>]+href=["'][^"']*\bcontact(?:-us)?\b[^"']*["']/i.test(
    lower,
  );
  const hasPrivacyLink = /<a[^>]+href=["'][^"']*\bprivacy\b[^"']*["']/i.test(lower);
  const hasEditorialPolicy =
    /<a[^>]+href=["'][^"']*\b(?:editorial(?:-policy)?|fact-checking|methodology|standards)\b[^"']*["']/i.test(
      lower,
    );

  // Images
  const imgMatches = Array.from(html.matchAll(/<img\b[^>]*>/gi));
  const imageCount = imgMatches.length;
  let describedImageCount = 0;
  for (const m of imgMatches) {
    if (/\salt=["'][^"']{3,}["']/i.test(m[0])) describedImageCount += 1;
  }

  return {
    hasAuthorByline,
    authorName,
    hasAuthorBio,
    hasAuthorSchema,
    hasPublishedDate: !!publishedDate,
    hasUpdatedDate: !!updatedDate,
    publishedDate,
    updatedDate,
    outboundCitationCount,
    authoritativeCitationCount,
    hasArticleSchema,
    hasOrganizationSchema,
    hasReviewerLine,
    hasAboutLink,
    hasContactLink,
    hasPrivacyLink,
    hasEditorialPolicy,
    hasHttps: isHttps,
    imageCount,
    describedImageCount,
  };
}

function scoreSignals(s: EeatSignals): EeatScore {
  // Each pillar maxes at 25.
  let experience = 0;
  if (s.hasAuthorByline) experience += 6;
  if (s.hasAuthorBio) experience += 6;
  if (s.imageCount >= 3) experience += 5;
  if (s.describedImageCount >= 3) experience += 4;
  if (s.imageCount > 0 && s.describedImageCount / Math.max(1, s.imageCount) >= 0.7)
    experience += 4;

  let expertise = 0;
  if (s.hasAuthorBio) expertise += 6;
  if (s.hasAuthorSchema) expertise += 6;
  if (s.hasReviewerLine) expertise += 7;
  if (s.outboundCitationCount >= 3) expertise += 3;
  if (s.outboundCitationCount >= 8) expertise += 3;

  let authority = 0;
  if (s.hasArticleSchema) authority += 6;
  if (s.hasOrganizationSchema) authority += 5;
  if (s.authoritativeCitationCount >= 1) authority += 4;
  if (s.authoritativeCitationCount >= 3) authority += 4;
  if (s.hasAboutLink) authority += 3;
  if (s.hasEditorialPolicy) authority += 3;

  let trust = 0;
  if (s.hasHttps) trust += 5;
  if (s.hasPublishedDate) trust += 4;
  if (s.hasUpdatedDate) trust += 5;
  if (s.hasContactLink) trust += 4;
  if (s.hasPrivacyLink) trust += 3;
  if (s.hasOrganizationSchema) trust += 4;

  experience = Math.min(25, experience);
  expertise = Math.min(25, expertise);
  authority = Math.min(25, authority);
  trust = Math.min(25, trust);

  return {
    experience,
    expertise,
    authority,
    trust,
    total: experience + expertise + authority + trust,
  };
}

function listMissing(s: EeatSignals): string[] {
  const out: string[] = [];
  if (!s.hasAuthorByline) out.push("Author byline (visible name with link to author page)");
  if (!s.hasAuthorBio)
    out.push("Author bio (1-2 sentences with credentials and topical background)");
  if (!s.hasAuthorSchema) out.push("Person schema for the author");
  if (!s.hasPublishedDate) out.push("Visible / structured published date");
  if (!s.hasUpdatedDate) out.push("Last-updated date (Google rewards demonstrable freshness)");
  if (!s.hasReviewerLine && !s.hasAuthorBio)
    out.push("Reviewer / fact-checker line (e.g. 'Medically reviewed by Dr. X')");
  if (s.outboundCitationCount < 3)
    out.push("Outbound citations to authoritative sources (currently " +
      s.outboundCitationCount + ")");
  if (s.authoritativeCitationCount === 0)
    out.push(".gov / .edu / Wikipedia / known-publisher citations");
  if (!s.hasArticleSchema) out.push("Article / NewsArticle / BlogPosting schema");
  if (!s.hasOrganizationSchema) out.push("Organization schema with sameAs links");
  if (!s.hasAboutLink) out.push("Visible link to About page in nav or footer");
  if (!s.hasContactLink) out.push("Visible Contact link in nav or footer");
  if (!s.hasPrivacyLink) out.push("Privacy policy link in footer");
  if (!s.hasEditorialPolicy)
    out.push("Editorial policy / methodology / standards page");
  if (!s.hasHttps) out.push("HTTPS — your page is still on HTTP");
  if (s.imageCount > 0 && s.describedImageCount / Math.max(1, s.imageCount) < 0.7) {
    const missingAlts = s.imageCount - s.describedImageCount;
    out.push(`Alt text on ${missingAlts} image${missingAlts === 1 ? "" : "s"}`);
  }
  return out;
}

const SYSTEM_PROMPT = `You are a senior content quality auditor working in Google's Search Quality Rater framework. The page below was scanned for E-E-A-T signals (Experience, Expertise, Authoritativeness, Trust). You see the score per pillar and a list of missing signals. Produce a concrete punch list of fixes.

Output in markdown bullets, grouped by pillar. Each bullet:
- States the fix concretely ("Add an author bio under the title with credentials and topical background — at least 2 sentences"), not vaguely
- Names the impact ("This is the top driver of perceived expertise on YMYL pages")
- ≤300 words total. No preamble. No closing summary.`;

async function aiBrief(opts: {
  url: string;
  signals: EeatSignals;
  score: EeatScore;
  missing: string[];
  clientId?: number;
}): Promise<string> {
  if (opts.missing.length === 0) {
    return "**No critical E-E-A-T gaps detected.** Your page already covers byline, dates, citations, schema, and trust pages. Focus on content depth and earning external mentions next.";
  }

  const userPrompt = [
    `URL: ${opts.url}`,
    `Score: ${opts.score.total}/100 — Experience ${opts.score.experience}/25 · Expertise ${opts.score.expertise}/25 · Authority ${opts.score.authority}/25 · Trust ${opts.score.trust}/25`,
    "",
    `Detected: author=${opts.signals.authorName ?? "(none)"} · authorBio=${opts.signals.hasAuthorBio} · authorSchema=${opts.signals.hasAuthorSchema} · published=${opts.signals.publishedDate ?? "(none)"} · updated=${opts.signals.updatedDate ?? "(none)"} · citations=${opts.signals.outboundCitationCount} (${opts.signals.authoritativeCitationCount} authoritative) · articleSchema=${opts.signals.hasArticleSchema} · orgSchema=${opts.signals.hasOrganizationSchema} · reviewerLine=${opts.signals.hasReviewerLine} · about=${opts.signals.hasAboutLink} · contact=${opts.signals.hasContactLink} · privacy=${opts.signals.hasPrivacyLink} · editorial=${opts.signals.hasEditorialPolicy} · https=${opts.signals.hasHttps} · imgs=${opts.signals.imageCount} (${opts.signals.describedImageCount} with alt)`,
    "",
    `Missing signals:`,
    ...opts.missing.map((m) => `  - ${m}`),
    "",
    "Write the fix punch list now, grouped by pillar (Experience / Expertise / Authoritativeness / Trust).",
  ].join("\n");

  const out = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 700,
    temperature: 0.4,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
  });
  return out ?? "";
}

async function fetchHtml(url: string): Promise<string | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await guardedFetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html/i.test(ct)) return null;
    return (await res.text()).slice(0, 1_200_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function emptyResult(url: string, error: string): EeatResult {
  return {
    url,
    signals: {
      hasAuthorByline: false,
      authorName: null,
      hasAuthorBio: false,
      hasAuthorSchema: false,
      hasPublishedDate: false,
      hasUpdatedDate: false,
      publishedDate: null,
      updatedDate: null,
      outboundCitationCount: 0,
      authoritativeCitationCount: 0,
      hasArticleSchema: false,
      hasOrganizationSchema: false,
      hasReviewerLine: false,
      hasAboutLink: false,
      hasContactLink: false,
      hasPrivacyLink: false,
      hasEditorialPolicy: false,
      hasHttps: false,
      imageCount: 0,
      describedImageCount: 0,
    },
    score: { experience: 0, expertise: 0, authority: 0, trust: 0, total: 0 },
    missing: [],
    brief: "",
    error,
  };
}
