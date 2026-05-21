/**
 * AI-driven single-page audit. Combines our existing heuristic page
 * inspectors (mobile, schema, social, EEAT) + a fresh fetch + a
 * 25-point SEO checklist. Each FAIL or WARN gets an AI-written
 * fix-steps block.
 *
 * Stores results in the existing audits + audit_issues tables with
 * `kind = "ai_full"` so the existing audit history view + reports
 * keep working.
 */

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, auditIssues, type NewAuditIssue } from "@/db/schema";
import { callAI } from "./ai-call";
import {
  validateSchemaFromUrl,
  extractSocialPreviews,
  checkMobileFriendliness,
  extractAnchorDistribution,
} from "./page-inspectors";
import { auditEeat } from "./eeat-audit";
import { measureCwv } from "./local-cwv";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type AuditCheck = {
  id: string;
  category:
    | "technical"
    | "on-page"
    | "content"
    | "schema"
    | "performance"
    | "mobile"
    | "social"
    | "eeat"
    | "security"
    | "accessibility";
  severity: "critical" | "high" | "medium" | "low";
  /** Short label like "HTTPS enabled". */
  title: string;
  /** True if passing, false if failing or warning. */
  pass: boolean;
  /** Human-readable detail of the finding. */
  message: string;
  /** Raw measurement / data point. */
  evidence?: string;
};

export type AiAuditResult = {
  ok: boolean;
  auditId?: number;
  url: string;
  score: number;
  passing: number;
  failing: number;
  checks: AuditCheck[];
  summary: string;
  error?: string;
};

const FETCH_TIMEOUT = 12_000;

/**
 * Main entry point. Creates an audit row, runs all checks, populates
 * audit_issues with AI-written fix steps, returns the audit ID.
 */
export async function runAiSiteAudit(opts: {
  clientId: number;
  url: string;
}): Promise<AiAuditResult> {
  const url = /^https?:\/\//i.test(opts.url) ? opts.url : `https://${opts.url}`;

  // Create the audit shell
  const [created] = await db
    .insert(audits)
    .values({
      clientId: opts.clientId,
      kind: "ai_full",
      targetUrl: url,
      status: "running",
      startedAt: new Date(),
    })
    .returning();
  if (!created) {
    return empty(url, "Couldn't create audit row.");
  }

  try {
    const [pageData, eeat, mobile, schema, social, anchors, cwv] =
      await Promise.all([
        fetchPage(url),
        auditEeat({ url }).catch(() => null),
        checkMobileFriendliness(url).catch(() => null),
        validateSchemaFromUrl(url).catch(() => null),
        extractSocialPreviews(url).catch(() => null),
        extractAnchorDistribution({ url }).catch(() => null),
        measureCwv(url, { device: "mobile" }).catch(() => null),
      ]);

    if (!pageData) {
      await db
        .update(audits)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(audits.id, created.id));
      return empty(url, "Couldn't fetch the page.");
    }

    const checks: AuditCheck[] = [
      ...checkTechnical(url, pageData),
      ...checkOnPage(pageData),
      ...checkContent(pageData),
      ...checkSocial(social),
      ...checkSchema(schema),
      ...checkEeat(eeat),
      ...checkMobile(mobile),
      ...checkPerformance(cwv),
      ...checkAnchors(anchors),
      ...checkSecurity(pageData),
    ];

    const passing = checks.filter((c) => c.pass).length;
    const failing = checks.length - passing;
    const weights: Record<AuditCheck["severity"], number> = {
      critical: 4,
      high: 2,
      medium: 1,
      low: 0.5,
    };
    let earned = 0,
      possible = 0;
    for (const c of checks) {
      possible += weights[c.severity];
      if (c.pass) earned += weights[c.severity];
    }
    const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    // Generate AI fix steps for each FAILING check
    const failingChecks = checks.filter((c) => !c.pass);
    const aiPrompt = buildAiPrompt(url, failingChecks, pageData.title ?? "");
    const aiText = await callAI({
      system: AI_SYSTEM_PROMPT,
      user: aiPrompt,
      maxTokens: 2500,
      temperature: 0.3,
      timeoutMs: 60_000,
      feature: "general",
      ignoreCreditSaver: true,
    });

    const fixStepsByTitle = parseFixSteps(aiText ?? "");

    // Generate executive summary
    const summary = await generateSummary({
      url,
      score,
      passing,
      failing: failingChecks.length,
      topIssues: failingChecks
        .filter((c) => c.severity === "critical" || c.severity === "high")
        .slice(0, 5)
        .map((c) => c.title),
    });

    // Insert all checks as audit_issues (passing ones marked resolved).
    // AI-generated rows always get confidence="test" — the user must
    // verify these against their actual page; the AI can't measure.
    const issuesToInsert: NewAuditIssue[] = checks.map((c) => ({
      auditId: created.id,
      severity: c.severity,
      type: c.id,
      url,
      message: c.message,
      status: c.pass ? "resolved" : "new",
      fixSteps: c.pass ? null : fixStepsByTitle.get(c.title) ?? null,
      category: c.category,
      aiGenerated: true,
      confidence: "test",
    }));
    if (issuesToInsert.length > 0) {
      await db.insert(auditIssues).values(issuesToInsert);
    }

    await db
      .update(audits)
      .set({
        status: "completed",
        score,
        issuesCount: failing,
        completedAt: new Date(),
        summary,
      })
      .where(eq(audits.id, created.id));

    return {
      ok: true,
      auditId: created.id,
      url,
      score,
      passing,
      failing,
      checks,
      summary,
    };
  } catch (err) {
    await db
      .update(audits)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(audits.id, created.id))
      .catch(() => {});
    return empty(url, (err as Error).message ?? "Audit failed");
  }
}

// =====================
// 25-point checklist
// =====================

type PageData = {
  status: number;
  finalUrl: string;
  isHttps: boolean;
  html: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  metaRobots: string | null;
  h1Count: number;
  h1Texts: string[];
  h2Count: number;
  imageCount: number;
  imagesWithAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  wordCount: number;
  hasViewport: boolean;
  responseHeaders: Record<string, string>;
  hasOg: boolean;
  hasTwitterCard: boolean;
  hasJsonLd: boolean;
};

async function fetchPage(url: string): Promise<PageData | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    const html = (await res.text()).slice(0, 1_500_000);
    const finalUrl = res.url;

    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });

    const title = match(html, /<title[^>]*>([^<]+)<\/title>/i);
    const metaDescription = match(
      html,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i,
    );
    const canonical = match(
      html,
      /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i,
    );
    const metaRobots = match(
      html,
      /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)/i,
    );
    const h1Texts: string[] = [];
    for (const m of html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)) {
      const t = stripTags(m[1]).trim();
      if (t) h1Texts.push(t);
    }
    const h2Count = (html.match(/<h2\b/gi) ?? []).length;
    const imgs = Array.from(html.matchAll(/<img\b[^>]*>/gi));
    const imagesWithAlt = imgs.filter((m) =>
      /\salt=["'][^"']{2,}["']/i.test(m[0]),
    ).length;
    const host = (() => {
      try {
        return new URL(finalUrl).hostname;
      } catch {
        return "";
      }
    })();
    let internalLinks = 0;
    let externalLinks = 0;
    for (const m of html.matchAll(
      /<a\s[^>]*href=["']([^"']+)["']/gi,
    )) {
      const href = m[1];
      if (!href || /^(#|javascript:|mailto:|tel:)/i.test(href)) continue;
      try {
        const u = new URL(href, finalUrl);
        if (u.hostname === host) internalLinks += 1;
        else externalLinks += 1;
      } catch {
        // ignore
      }
    }

    const text = stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;

    return {
      status: res.status,
      finalUrl,
      isHttps: /^https:\/\//i.test(finalUrl),
      html,
      title,
      metaDescription,
      canonical,
      metaRobots,
      h1Count: h1Texts.length,
      h1Texts,
      h2Count,
      imageCount: imgs.length,
      imagesWithAlt,
      internalLinkCount: internalLinks,
      externalLinkCount: externalLinks,
      wordCount,
      hasViewport: /<meta[^>]+name=["']viewport["']/i.test(html),
      responseHeaders: headers,
      hasOg: /property=["']og:/i.test(html),
      hasTwitterCard: /name=["']twitter:card["']/i.test(html),
      hasJsonLd: /<script[^>]+type=["']application\/ld\+json["']/i.test(html),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function checkTechnical(url: string, p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  out.push({
    id: "https",
    category: "technical",
    severity: "critical",
    title: "HTTPS",
    pass: p.isHttps,
    message: p.isHttps ? "Page is served over HTTPS." : "Page is on HTTP — Google has used HTTPS as a signal since 2014.",
    evidence: `final URL: ${p.finalUrl}`,
  });
  out.push({
    id: "status",
    category: "technical",
    severity: "critical",
    title: "200 OK status",
    pass: p.status >= 200 && p.status < 300,
    message: p.status >= 200 && p.status < 300 ? `Returns ${p.status}.` : `Returns ${p.status} — broken or redirecting unexpectedly.`,
    evidence: `status: ${p.status}`,
  });
  out.push({
    id: "canonical",
    category: "technical",
    severity: "high",
    title: "Canonical tag",
    pass: !!p.canonical,
    message: p.canonical
      ? `Canonical points to ${p.canonical}.`
      : "No <link rel=\"canonical\"> — leaves Google to guess the canonical version.",
    evidence: p.canonical ?? "—",
  });
  const robotsBlocked = p.metaRobots
    ? /noindex/i.test(p.metaRobots)
    : false;
  out.push({
    id: "indexable",
    category: "technical",
    severity: "critical",
    title: "Page is indexable",
    pass: !robotsBlocked,
    message: robotsBlocked
      ? `Page has 'noindex' in <meta name="robots">: ${p.metaRobots}`
      : "No 'noindex' directive — page is indexable.",
    evidence: p.metaRobots ?? "(no robots meta)",
  });
  return out;
}

function checkOnPage(p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  const titleLen = p.title?.trim().length ?? 0;
  out.push({
    id: "title",
    category: "on-page",
    severity: "high",
    title: "Title tag length 30-60 chars",
    pass: titleLen >= 30 && titleLen <= 70,
    message:
      titleLen === 0
        ? "Page is missing a <title>."
        : titleLen < 30
          ? `Title is ${titleLen} chars — under the 30 char minimum.`
          : titleLen > 70
            ? `Title is ${titleLen} chars — Google will truncate over ~60.`
            : `Title is ${titleLen} chars.`,
    evidence: p.title ?? "(none)",
  });
  const metaLen = p.metaDescription?.trim().length ?? 0;
  out.push({
    id: "meta_description",
    category: "on-page",
    severity: "medium",
    title: "Meta description 120-160 chars",
    pass: metaLen >= 120 && metaLen <= 165,
    message:
      metaLen === 0
        ? "Missing meta description."
        : metaLen < 120
          ? `Meta description is ${metaLen} chars — too short.`
          : metaLen > 165
            ? `Meta description is ${metaLen} chars — Google will truncate.`
            : `Meta description is ${metaLen} chars.`,
    evidence: p.metaDescription ?? "(none)",
  });
  out.push({
    id: "h1",
    category: "on-page",
    severity: "high",
    title: "Exactly one H1",
    pass: p.h1Count === 1,
    message:
      p.h1Count === 0
        ? "No H1 found — Google relies on the H1 to disambiguate the page topic."
        : p.h1Count === 1
          ? `One H1: "${p.h1Texts[0].slice(0, 80)}".`
          : `${p.h1Count} H1s — picks one focal topic, not many.`,
    evidence: `H1 count: ${p.h1Count}`,
  });
  out.push({
    id: "heading_structure",
    category: "on-page",
    severity: "medium",
    title: "Has H2 subheadings",
    pass: p.h2Count >= 2,
    message:
      p.h2Count >= 2
        ? `${p.h2Count} H2s — good content structure.`
        : `${p.h2Count} H2s — long content needs subheadings for scanability and snippet eligibility.`,
    evidence: `H2 count: ${p.h2Count}`,
  });
  return out;
}

function checkContent(p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  out.push({
    id: "word_count",
    category: "content",
    severity: "medium",
    title: "Page has substantial content (≥300 words)",
    pass: p.wordCount >= 300,
    message:
      p.wordCount >= 300
        ? `${p.wordCount} words — substantial content.`
        : `${p.wordCount} words — likely thin. Even short pages should clear 300 words.`,
    evidence: `word count: ${p.wordCount}`,
  });
  const altCoverage = p.imageCount === 0 ? 1 : p.imagesWithAlt / p.imageCount;
  out.push({
    id: "image_alts",
    category: "content",
    severity: "medium",
    title: "Image alt-text coverage ≥80%",
    pass: altCoverage >= 0.8,
    message:
      p.imageCount === 0
        ? "No images on page."
        : `${p.imagesWithAlt}/${p.imageCount} images have alt text (${Math.round(altCoverage * 100)}%).`,
    evidence: `images: ${p.imageCount}, with alt: ${p.imagesWithAlt}`,
  });
  out.push({
    id: "internal_links",
    category: "content",
    severity: "medium",
    title: "Internal linking (≥3 links)",
    pass: p.internalLinkCount >= 3,
    message:
      p.internalLinkCount >= 3
        ? `${p.internalLinkCount} internal links — distributes link equity.`
        : `Only ${p.internalLinkCount} internal links — page is isolated.`,
    evidence: `internal: ${p.internalLinkCount}`,
  });
  out.push({
    id: "external_citations",
    category: "content",
    severity: "low",
    title: "Outbound citations (≥1 link)",
    pass: p.externalLinkCount >= 1,
    message:
      p.externalLinkCount >= 1
        ? `${p.externalLinkCount} outbound links — well-cited.`
        : "No outbound citations — Google rewards well-cited content.",
    evidence: `external: ${p.externalLinkCount}`,
  });
  return out;
}

function checkSocial(s: { warnings: string[]; og: { image: string | null }; twitter: { card: string | null } } | null): AuditCheck[] {
  if (!s) return [];
  return [
    {
      id: "og_image",
      category: "social",
      severity: "low",
      title: "OG image present",
      pass: !!s.og.image,
      message: s.og.image
        ? `og:image set (${s.og.image.slice(0, 80)}).`
        : "Missing og:image — share previews will be image-less.",
    },
    {
      id: "twitter_card",
      category: "social",
      severity: "low",
      title: "Twitter card present",
      pass: !!s.twitter.card,
      message: s.twitter.card
        ? `twitter:card = "${s.twitter.card}".`
        : "Missing twitter:card — defaults to a smaller share preview.",
    },
  ];
}

function checkSchema(s: { blocks: { errors: string[]; warnings: string[] }[] } | null): AuditCheck[] {
  if (!s) return [];
  const totalBlocks = s.blocks.length;
  const validBlocks = s.blocks.filter((b) => b.errors.length === 0).length;
  return [
    {
      id: "schema_present",
      category: "schema",
      severity: "medium",
      title: "Structured data (JSON-LD)",
      pass: totalBlocks > 0,
      message:
        totalBlocks > 0
          ? `${totalBlocks} JSON-LD block${totalBlocks === 1 ? "" : "s"} present.`
          : "No JSON-LD found — missing rich-result eligibility.",
    },
    {
      id: "schema_valid",
      category: "schema",
      severity: "high",
      title: "Schema is valid (no errors)",
      pass: totalBlocks === 0 || validBlocks === totalBlocks,
      message:
        totalBlocks === 0
          ? "No schema to validate."
          : validBlocks === totalBlocks
            ? `All ${totalBlocks} block${totalBlocks === 1 ? "" : "s"} valid.`
            : `${totalBlocks - validBlocks} block${totalBlocks - validBlocks === 1 ? " has" : "s have"} errors.`,
    },
  ];
}

function checkEeat(e: import("./eeat-audit").EeatResult | null): AuditCheck[] {
  if (!e) return [];
  return [
    {
      id: "eeat_byline",
      category: "eeat",
      severity: "high",
      title: "Author byline + bio (E-E-A-T)",
      pass: e.signals.hasAuthorByline && e.signals.hasAuthorBio,
      message: e.signals.hasAuthorByline
        ? e.signals.hasAuthorBio
          ? `Author byline (${e.signals.authorName ?? "yes"}) + bio detected.`
          : "Byline present but no bio. Add credentials + topical background."
        : "No author byline. Anonymous content gets penalized on YMYL queries.",
    },
    {
      id: "eeat_dates",
      category: "eeat",
      severity: "medium",
      title: "Published + updated dates",
      pass: e.signals.hasPublishedDate && e.signals.hasUpdatedDate,
      message:
        e.signals.hasPublishedDate && e.signals.hasUpdatedDate
          ? "Published + last-updated dates present."
          : !e.signals.hasPublishedDate
            ? "Missing publish date."
            : "Missing 'last-updated' date — Google rewards demonstrable freshness.",
    },
    {
      id: "eeat_authoritative",
      category: "eeat",
      severity: "medium",
      title: "Authoritative outbound citations",
      pass: e.signals.authoritativeCitationCount >= 1,
      message:
        e.signals.authoritativeCitationCount > 0
          ? `${e.signals.authoritativeCitationCount} citations to authoritative sources (.gov / .edu / Wikipedia / known publishers).`
          : "No citations to authoritative sources detected.",
    },
  ];
}

function checkMobile(m: import("./page-inspectors").MobileFriendlyCheck | null): AuditCheck[] {
  if (!m) return [];
  return [
    {
      id: "mobile_viewport",
      category: "mobile",
      severity: "critical",
      title: "Viewport meta sane",
      pass: m.hasViewport && m.viewportSane,
      message: m.hasViewport
        ? m.viewportSane
          ? `Viewport: ${m.viewport}`
          : "Viewport blocks scaling — accessibility violation."
        : "No viewport meta — page renders desktop-width on mobile.",
    },
    {
      id: "mobile_no_interstitial",
      category: "mobile",
      severity: "medium",
      title: "No intrusive interstitial",
      pass: !m.hasInterstitial,
      message: m.hasInterstitial
        ? "Modal / popup / cookie banner / GDPR overlay detected — Google penalizes intrusive interstitials on mobile."
        : "No intrusive overlay detected.",
    },
  ];
}

function checkPerformance(c: import("./local-cwv").CwvResult | null): AuditCheck[] {
  if (!c || !c.ok) return [];
  return [
    {
      id: "perf_lcp",
      category: "performance",
      severity: "high",
      title: "LCP under 2.5s (mobile)",
      pass: c.lcpMs !== null && c.lcpMs <= 2500,
      message:
        c.lcpMs === null
          ? "LCP not measured."
          : c.lcpMs <= 2500
            ? `LCP ${(c.lcpMs / 1000).toFixed(2)}s — good.`
            : `LCP ${(c.lcpMs / 1000).toFixed(2)}s — over the 2.5s threshold.`,
    },
    {
      id: "perf_cls",
      category: "performance",
      severity: "medium",
      title: "CLS under 0.1",
      pass: c.cls !== null && c.cls <= 0.1,
      message:
        c.cls === null
          ? "CLS not measured."
          : c.cls <= 0.1
            ? `CLS ${c.cls.toFixed(3)} — good.`
            : `CLS ${c.cls.toFixed(3)} — layout shifts above 0.1.`,
    },
    {
      id: "perf_score",
      category: "performance",
      severity: "high",
      title: "Performance score ≥ 75",
      pass: c.performanceScore !== null && c.performanceScore >= 75,
      message:
        c.performanceScore === null
          ? "No performance score available."
          : c.performanceScore >= 75
            ? `Score ${c.performanceScore}/100 — strong.`
            : `Score ${c.performanceScore}/100 — needs work.`,
    },
  ];
}

function checkAnchors(a: import("./page-inspectors").AnchorDistribution | null): AuditCheck[] {
  if (!a) return [];
  return [
    {
      id: "anchor_overopt",
      category: "on-page",
      severity: "low",
      title: "Anchor text not over-optimized",
      pass: a.exactMatchPct < 5,
      message:
        a.exactMatchPct < 5
          ? `Exact-match anchor share is ${a.exactMatchPct.toFixed(1)}% — within safe range.`
          : `${a.exactMatchPct.toFixed(1)}% exact-match anchors — over-optimization risk.`,
    },
  ];
}

function checkSecurity(p: PageData): AuditCheck[] {
  const out: AuditCheck[] = [];
  const hsts = !!p.responseHeaders["strict-transport-security"];
  out.push({
    id: "hsts",
    category: "security",
    severity: "low",
    title: "HSTS header set",
    pass: hsts,
    message: hsts
      ? "Strict-Transport-Security header present."
      : "No HSTS header — browsers can't enforce HTTPS-only after first visit.",
    evidence: p.responseHeaders["strict-transport-security"] ?? "(none)",
  });
  const xfo = p.responseHeaders["x-frame-options"] || p.responseHeaders["content-security-policy"];
  out.push({
    id: "clickjacking",
    category: "security",
    severity: "low",
    title: "Clickjacking protection",
    pass: !!xfo,
    message: xfo
      ? "X-Frame-Options or CSP frame-ancestors set."
      : "No X-Frame-Options + no CSP frame-ancestors — page can be iframed by anyone.",
  });
  return out;
}

// =====================
// AI fix-step generation
// =====================

const AI_SYSTEM_PROMPT = `You write step-by-step SEO fix instructions. Given a list of failing checks for a single web page, return ONE markdown block per check with:

- A heading: "## <exact title verbatim>"
- 3-6 specific actionable steps (numbered list)
- Reference what tooling / file the user edits (e.g. "Edit theme.liquid in Shopify", "Update title in Yoast SEO sidebar in WordPress", "Modify <head> in your Next.js layout")
- Mention the expected outcome for each step
- ≤140 words per check

Do NOT add preamble. Do NOT add a closing summary. Output only the markdown blocks separated by a blank line.`;

function buildAiPrompt(
  url: string,
  failingChecks: AuditCheck[],
  pageTitle: string,
): string {
  return [
    `URL: ${url}`,
    `Page title: ${pageTitle || "(none)"}`,
    "",
    `Failing checks (write fix steps for each):`,
    ...failingChecks.map(
      (c, i) =>
        `${i + 1}. ${c.title} — ${c.message}${c.evidence ? ` (Evidence: ${c.evidence.slice(0, 200)})` : ""}`,
    ),
    "",
    "Write the markdown blocks now.",
  ].join("\n");
}

function parseFixSteps(aiText: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!aiText) return out;
  const blocks = aiText.split(/\n##\s+/);
  for (let i = 0; i < blocks.length; i++) {
    const block = (i === 0 ? blocks[i].replace(/^##\s+/, "") : blocks[i]).trim();
    if (!block) continue;
    const firstNewline = block.indexOf("\n");
    if (firstNewline === -1) continue;
    const title = block.slice(0, firstNewline).trim();
    const body = block.slice(firstNewline + 1).trim();
    if (title && body) out.set(title, body);
  }
  return out;
}

// =====================
// Summary
// =====================

async function generateSummary(opts: {
  url: string;
  score: number;
  passing: number;
  failing: number;
  topIssues: string[];
}): Promise<string> {
  if (opts.failing === 0) {
    return `Audit complete. ${opts.url} passes all ${opts.passing} checks (score ${opts.score}/100). No critical fixes needed.`;
  }
  const out = await callAI({
    system:
      "You write 2-3 sentence executive summaries of an SEO audit. Direct, concrete, references specific issues by name. No preamble.",
    user: [
      `URL: ${opts.url}`,
      `Score: ${opts.score}/100`,
      `${opts.passing} passing, ${opts.failing} failing`,
      `Top issues: ${opts.topIssues.join("; ")}`,
      "",
      "Write the summary now.",
    ].join("\n"),
    maxTokens: 200,
    temperature: 0.4,
    timeoutMs: 20_000,
    feature: "exec_summary",
  });
  return (
    out ??
    `Audit complete. ${opts.url} scored ${opts.score}/100. ${opts.failing} fixes pending — top concerns: ${opts.topIssues.slice(0, 3).join(", ")}.`
  );
}

// =====================
// Helpers
// =====================

function match(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}
function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}
function empty(url: string, error: string): AiAuditResult {
  return {
    ok: false,
    url,
    score: 0,
    passing: 0,
    failing: 0,
    checks: [],
    summary: "",
    error,
  };
}
