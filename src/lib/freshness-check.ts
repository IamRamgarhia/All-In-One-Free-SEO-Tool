/**
 * Freshness auditor for a live URL. AI-search systems (Google AI
 * Overviews, Perplexity, ChatGPT) weight recency heavily — a page
 * with an old-looking `dateModified` gets skipped for one that
 * appears fresher, even when the content is stronger.
 *
 * This module fetches a URL, harvests every freshness signal it can
 * find, and reports:
 *   1. Which signals exist (HTTP Last-Modified header, meta tags,
 *      JSON-LD `dateModified`, visible "Last updated" text, sitemap
 *      lastmod if user supplied a sitemap URL).
 *   2. Whether they agree, disagree, or contradict each other.
 *   3. A score 0-100 based on newest signal age + signal completeness.
 *   4. A ready-to-paste JSON-LD patch that adds a fresh `dateModified`
 *      + `datePublished` so the user can drop it into their `<head>`.
 *
 * All free — no APIs, just a fetch and some regex parsing.
 */

import { guardedFetch } from "./url-guard";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SEO-Tool-Freshness/1.0; +https://github.com/IamRamgarhia/All-In-One-Free-SEO-Tool)";

export type FreshnessSignal = {
  source:
    | "http-header"
    | "meta-tag"
    | "json-ld"
    | "time-element"
    | "visible-text"
    | "sitemap";
  label: string;
  value: string;
  parsedDate: string | null;
  ageDays: number | null;
};

export type FreshnessAudit =
  | {
      ok: true;
      url: string;
      fetchedAt: string;
      signals: FreshnessSignal[];
      newestSignal: FreshnessSignal | null;
      newestAgeDays: number | null;
      score: number;
      verdict: "fresh" | "aging" | "stale" | "unknown";
      warnings: string[];
      suggestedPatch: string;
    }
  | { ok: false; url: string; error: string };

const MS_PER_DAY = 86400 * 1000;

export async function auditFreshness(
  url: string,
  opts?: { sitemapUrl?: string; timeoutMs?: number },
): Promise<FreshnessAudit> {
  let normalizedUrl = url;
  if (!/^https?:\/\//i.test(normalizedUrl))
    normalizedUrl = `https://${normalizedUrl}`;
  try {
    new URL(normalizedUrl);
  } catch {
    return { ok: false, url, error: "Invalid URL." };
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), opts?.timeoutMs ?? 15_000);
  const now = Date.now();
  try {
    const res = await guardedFetch(normalizedUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      signal: ac.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        url: normalizedUrl,
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }
    const html = await res.text();
    const signals: FreshnessSignal[] = [];

    // 1. HTTP Last-Modified header
    const lastMod = res.headers.get("last-modified");
    if (lastMod) {
      signals.push(makeSignal("http-header", "Last-Modified header", lastMod, now));
    }

    // 2. Meta tags — article:modified_time, article:published_time,
    //    og:updated_time, name="last-modified", name="date"
    for (const meta of extractMetaTags(html)) {
      signals.push(makeSignal("meta-tag", meta.name, meta.content, now));
    }

    // 3. JSON-LD structured data — dateModified + datePublished
    for (const jsonld of extractJsonLdDates(html)) {
      signals.push(
        makeSignal(
          "json-ld",
          jsonld.type ? `${jsonld.type}.${jsonld.key}` : jsonld.key,
          jsonld.value,
          now,
        ),
      );
    }

    // 4. <time datetime="…"> elements
    for (const timeEl of extractTimeElements(html)) {
      signals.push(makeSignal("time-element", "time element", timeEl, now));
    }

    // 5. Visible "Last updated" / "Updated" / "Modified on" text
    for (const visible of extractVisibleUpdatedText(html)) {
      signals.push(makeSignal("visible-text", visible.label, visible.value, now));
    }

    // 6. Sitemap lastmod (optional — only if user supplied a sitemap URL)
    if (opts?.sitemapUrl) {
      const sm = await fetchSitemapLastmod(
        opts.sitemapUrl,
        normalizedUrl,
        ac.signal,
      );
      if (sm) {
        signals.push(makeSignal("sitemap", "sitemap lastmod", sm, now));
      }
    }

    const parsedSignals = signals.filter((s) => s.ageDays != null);
    const newestSignal = parsedSignals.length
      ? parsedSignals.reduce((a, b) =>
          (a.ageDays ?? Infinity) < (b.ageDays ?? Infinity) ? a : b,
        )
      : null;
    const newestAgeDays = newestSignal?.ageDays ?? null;

    const { score, verdict, warnings } = grade(signals, newestAgeDays);
    const suggestedPatch = buildSuggestedPatch(now, newestSignal, signals);

    return {
      ok: true,
      url: normalizedUrl,
      fetchedAt: new Date(now).toISOString(),
      signals,
      newestSignal,
      newestAgeDays,
      score,
      verdict,
      warnings,
      suggestedPatch,
    };
  } catch (err) {
    return { ok: false, url: normalizedUrl, error: (err as Error).message };
  } finally {
    clearTimeout(t);
  }
}

function makeSignal(
  source: FreshnessSignal["source"],
  label: string,
  value: string,
  now: number,
): FreshnessSignal {
  const parsed = safeParseDate(value);
  const ageDays = parsed
    ? Math.max(0, Math.floor((now - parsed.getTime()) / MS_PER_DAY))
    : null;
  return {
    source,
    label,
    value,
    parsedDate: parsed ? parsed.toISOString() : null,
    ageDays,
  };
}

function safeParseDate(raw: string): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const t = Date.parse(trimmed);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    if (d.getFullYear() > 1990 && d.getFullYear() < 2100) return d;
  }
  return null;
}

function extractMetaTags(
  html: string,
): { name: string; content: string }[] {
  const results: { name: string; content: string }[] = [];
  const patterns = [
    /property=["']article:modified_time["']/i,
    /property=["']article:published_time["']/i,
    /property=["']og:updated_time["']/i,
    /name=["']last-modified["']/i,
    /name=["']date["']/i,
    /name=["']DC\.date["']/i,
    /name=["']pubdate["']/i,
    /http-equiv=["']last-modified["']/i,
  ];
  const metaRe = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const tag = m[0];
    const matchedPattern = patterns.find((p) => p.test(tag));
    if (!matchedPattern) continue;
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    if (!contentMatch) continue;
    const nameMatch =
      tag.match(/(?:property|name|http-equiv)=["']([^"']+)["']/i);
    results.push({
      name: nameMatch ? nameMatch[1] : "meta",
      content: contentMatch[1],
    });
  }
  return results;
}

function extractJsonLdDates(
  html: string,
): { type: string | null; key: string; value: string }[] {
  const results: { type: string | null; key: string; value: string }[] = [];
  const scriptRe =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    const raw = m[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const stack: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        const type = typeof obj["@type"] === "string" ? (obj["@type"] as string) : null;
        for (const key of ["dateModified", "datePublished", "uploadDate", "dateCreated"]) {
          const value = obj[key];
          if (typeof value === "string" && value) {
            results.push({ type, key, value });
          }
        }
        for (const v of Object.values(obj)) {
          if (v && typeof v === "object") stack.push(v);
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return results;
}

function extractTimeElements(html: string): string[] {
  const results: string[] = [];
  const re = /<time\b[^>]*datetime=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function extractVisibleUpdatedText(
  html: string,
): { label: string; value: string }[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const results: { label: string; value: string }[] = [];
  const patterns: { label: string; re: RegExp }[] = [
    {
      label: "Last updated",
      re: /(?:last\s+updated|updated\s+on|last\s+modified|modified\s+on|last\s+reviewed)[:\s]+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})/gi,
    },
    {
      label: "Published",
      re: /(?:published(?:\s+on)?)[:\s]+([A-Z][a-z]+\.?\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/gi,
    },
  ];
  for (const { label, re } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      results.push({ label, value: m[1] });
    }
  }
  return results;
}

async function fetchSitemapLastmod(
  sitemapUrl: string,
  targetUrl: string,
  signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await guardedFetch(sitemapUrl, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/xml,text/xml",
      },
      signal,
    });
    if (!res.ok) return null;
    const xml = await res.text();
    // Find <url><loc>targetUrl</loc><lastmod>…</lastmod></url>
    const urlBlockRe = /<url>[\s\S]*?<\/url>/gi;
    let m: RegExpExecArray | null;
    while ((m = urlBlockRe.exec(xml)) !== null) {
      const block = m[0];
      const locMatch = block.match(/<loc>([^<]+)<\/loc>/i);
      if (!locMatch) continue;
      const loc = locMatch[1].trim();
      if (
        loc === targetUrl ||
        loc.replace(/\/$/, "") === targetUrl.replace(/\/$/, "")
      ) {
        const lastmodMatch = block.match(/<lastmod>([^<]+)<\/lastmod>/i);
        return lastmodMatch ? lastmodMatch[1].trim() : null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function grade(
  signals: FreshnessSignal[],
  newestAgeDays: number | null,
): { score: number; verdict: FreshnessAudit extends { ok: true } ? "fresh" | "aging" | "stale" | "unknown" : never; warnings: string[] } {
  const warnings: string[] = [];

  // Signal completeness — which signals exist?
  const hasJsonLd = signals.some((s) => s.source === "json-ld");
  const hasMeta = signals.some((s) => s.source === "meta-tag");
  const hasVisible = signals.some((s) => s.source === "visible-text");
  const hasTime = signals.some((s) => s.source === "time-element");

  if (!hasJsonLd) {
    warnings.push(
      "No JSON-LD dateModified/datePublished. AI-search systems parse structured data first — add an Article schema with a fresh dateModified.",
    );
  }
  if (!hasMeta) {
    warnings.push(
      "No article:modified_time or last-modified meta tag. Add one so Open Graph consumers see the update date.",
    );
  }
  if (!hasVisible) {
    warnings.push(
      'No human-visible "Last updated" text on the page. Some AIs (especially Perplexity) look for this before citing.',
    );
  }
  if (!hasTime && !hasVisible) {
    warnings.push(
      "No <time datetime='…'> element. This helps assistive tech and structured-data parsers alike.",
    );
  }

  // Signal disagreement — if two signals point to dates >90 days apart,
  // flag it. AI systems can pick the older one and downweight.
  const dated = signals
    .filter((s) => s.parsedDate)
    .map((s) => ({ src: s, date: new Date(s.parsedDate!).getTime() }));
  if (dated.length >= 2) {
    const min = dated.reduce((a, b) => (a.date < b.date ? a : b));
    const max = dated.reduce((a, b) => (a.date > b.date ? a : b));
    const gapDays = Math.floor((max.date - min.date) / MS_PER_DAY);
    if (gapDays > 90) {
      warnings.push(
        `Signals disagree by ${gapDays} days — "${min.src.label}" says ${min.src.value}, "${max.src.label}" says ${max.src.value}. Align them to the newest.`,
      );
    }
  }

  let score: number;
  let verdict: "fresh" | "aging" | "stale" | "unknown";

  if (newestAgeDays == null) {
    score = 20;
    verdict = "unknown";
    warnings.unshift(
      "No parseable freshness signal at all. AI-search systems will treat this page as undated.",
    );
  } else if (newestAgeDays <= 90) {
    score = 100 - Math.min(15, warnings.length * 5);
    verdict = "fresh";
  } else if (newestAgeDays <= 365) {
    score = Math.max(55, 85 - Math.floor(newestAgeDays / 30) * 3);
    verdict = "aging";
  } else {
    score = Math.max(20, 55 - Math.floor(newestAgeDays / 365) * 10);
    verdict = "stale";
    warnings.unshift(
      `Newest signal is ${Math.floor(newestAgeDays / 30)} months old. Refresh the content and update dateModified to today.`,
    );
  }

  score = Math.max(0, Math.min(100, score));
  return { score, verdict: verdict as never, warnings };
}

function buildSuggestedPatch(
  now: number,
  newestSignal: FreshnessSignal | null,
  signals: FreshnessSignal[],
): string {
  const nowIso = new Date(now).toISOString();
  const publishedIso =
    signals
      .filter(
        (s) =>
          s.parsedDate &&
          /publish|created/i.test(s.label + s.value),
      )
      .map((s) => s.parsedDate)
      .find(Boolean) ??
    newestSignal?.parsedDate ??
    nowIso;

  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "REPLACE_WITH_YOUR_HEADLINE",
      datePublished: publishedIso,
      dateModified: nowIso,
      author: {
        "@type": "Person",
        name: "REPLACE_WITH_AUTHOR_NAME",
      },
    },
    null,
    2,
  );

  return `<!-- Drop this inside <head>. AI-search systems parse this first. -->
<script type="application/ld+json">
${jsonLd}
</script>

<!-- Also add a visible line the reader (and Perplexity's scraper) can see: -->
<p><em>Last updated: ${new Date(now).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })}</em></p>

<!-- Optionally add the OpenGraph modified time meta: -->
<meta property="article:modified_time" content="${nowIso}" />`;
}
