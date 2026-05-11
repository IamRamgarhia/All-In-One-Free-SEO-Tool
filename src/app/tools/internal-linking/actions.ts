"use server";

import { saveToolRun } from "@/lib/tool-runs";

const UA =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost) InternalLinker";

export type LinkSuggestion = {
  fromUrl: string;
  fromTitle: string;
  matchedPhrase: string;
  /** Section / paragraph context where the phrase appears. */
  context: string;
  /** Whether this page already links to the target. */
  alreadyLinks: boolean;
};

export type InternalLinkResult =
  | {
      ok: true;
      targetUrl: string;
      targetKeyword: string;
      pagesScanned: number;
      suggestions: LinkSuggestion[];
    }
  | { ok: false; error: string };

async function fetchText(url: string, timeoutMs = 12_000): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      headers: { "user-agent": UA, accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html.slice(0, 800_000);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1]?.trim() ?? "";
}

function extractInternalLinks(html: string, base: string): string[] {
  const baseHost = new URL(base).hostname;
  const hrefs = [
    ...html.matchAll(/<a\s+[^>]*href=(?:"([^"]*)"|'([^']*)')/gi),
  ]
    .map((m) => m[1] ?? m[2])
    .filter(Boolean);
  const out = new Set<string>();
  for (const href of hrefs) {
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const u = new URL(href, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      if (u.hostname !== baseHost) continue;
      // Strip fragment, normalize trailing slash
      u.hash = "";
      out.add(u.toString());
    } catch {
      // ignore
    }
  }
  return Array.from(out);
}

function strip(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findPhraseContext(
  text: string,
  phrase: string,
  contextChars = 90,
): string | null {
  const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
  const m = text.match(re);
  if (!m || m.index === undefined) return null;
  const start = Math.max(0, m.index - contextChars);
  const end = Math.min(text.length, m.index + phrase.length + contextChars);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet;
  if (end < text.length) snippet = snippet + "…";
  return snippet;
}

function pageLinksTo(html: string, target: string, base: string): boolean {
  const links = extractInternalLinks(html, base);
  return links.some(
    (l) =>
      l.replace(/\/$/, "") === target.replace(/\/$/, "") ||
      l.replace(/^https?:\/\//, "") === target.replace(/^https?:\/\//, ""),
  );
}

export async function suggestInternalLinks(input: {
  targetUrl: string;
  targetKeyword: string;
  /** How many internal pages to crawl from the target's site. Default 25. */
  limit?: number;
}): Promise<InternalLinkResult> {
  const target = input.targetUrl.trim();
  const keyword = input.targetKeyword.trim();
  if (!target || !keyword) {
    return { ok: false, error: "Both target URL and keyword required" };
  }
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(
      /^https?:\/\//i.test(target) ? target : `https://${target}`,
    );
  } catch {
    return { ok: false, error: "Invalid target URL" };
  }

  // Fetch target page → extract internal links → BFS-shallow (depth 1)
  const targetHtml = await fetchText(parsedTarget.toString());
  if (!targetHtml) {
    return { ok: false, error: "Couldn't fetch target URL" };
  }

  const baseOrigin = parsedTarget.origin;
  const seedLinks = extractInternalLinks(targetHtml, parsedTarget.toString());

  // Try the sitemap as a richer source
  let sitemapLinks: string[] = [];
  try {
    const sm = await fetchText(`${baseOrigin}/sitemap.xml`, 8000);
    if (sm) {
      sitemapLinks = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => m[1].trim())
        .filter((u) => {
          try {
            return (
              new URL(u).hostname === parsedTarget.hostname &&
              u !== parsedTarget.toString()
            );
          } catch {
            return false;
          }
        });
    }
  } catch {
    // ignore
  }

  // Combine and dedupe
  const combined = Array.from(
    new Set([...sitemapLinks, ...seedLinks]),
  )
    .filter((u) => u !== parsedTarget.toString())
    .slice(0, input.limit ?? 25);

  // Crawl each, look for keyword match in body text
  const suggestions: LinkSuggestion[] = [];
  await Promise.all(
    combined.map(async (url) => {
      const html = await fetchText(url, 8_000);
      if (!html) return;
      const title = extractTitle(html);
      const text = strip(html);
      const ctx = findPhraseContext(text, keyword);
      if (!ctx) return;
      const alreadyLinks = pageLinksTo(html, parsedTarget.toString(), url);
      suggestions.push({
        fromUrl: url,
        fromTitle: title || new URL(url).pathname,
        matchedPhrase: keyword,
        context: ctx,
        alreadyLinks,
      });
    }),
  );

  // Sort: pages that DON'T already link first, then by URL length (deeper pages later)
  suggestions.sort((a, b) => {
    if (a.alreadyLinks !== b.alreadyLinks) return a.alreadyLinks ? 1 : -1;
    return a.fromUrl.length - b.fromUrl.length;
  });

  const out = {
    ok: true as const,
    targetUrl: parsedTarget.toString(),
    targetKeyword: keyword,
    pagesScanned: combined.length,
    suggestions,
  };
  await saveToolRun({
    toolId: "internal-linking",
    label: `${keyword} · ${suggestions.length} link ops · ${combined.length} pages scanned`,
    input: { targetUrl: parsedTarget.toString(), keyword },
    result: out,
  }).catch(() => undefined);
  return out;
}
