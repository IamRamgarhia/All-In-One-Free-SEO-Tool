/**
 * Soft-404 catcher. Crawls the site, fetches each HTML page, flags pages
 * that return 200 but smell like 404s:
 *   - Visible text < 100 words
 *   - Body contains "page not found" / "404" / "doesn't exist" patterns
 *   - Title is generic 404 wording
 *   - Page is just nav + footer with no main content
 *
 * These are silent indexation killers. Google labels them in GSC as
 * "soft 404", but most teams never check.
 */

import { crawlSite } from "./sitemap-generator";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type SoftFourOhFour = {
  url: string;
  status: number;
  /** Why we flagged it. */
  reason:
    | "thin-content"
    | "404-text-pattern"
    | "404-title-pattern"
    | "no-h1-thin";
  detail: string;
  wordCount: number;
};

export type Soft404Result = {
  ok: boolean;
  pagesChecked: number;
  flagged: SoftFourOhFour[];
  error?: string;
};

const FETCH_TIMEOUT = 10_000;

const TEXT_PATTERNS = [
  /\bpage not found\b/i,
  /\b404\s*-?\s*not found\b/i,
  /\bthis page (?:does(?:n['']?t)? exist|isn['']?t available)\b/i,
  /\bthe page you're looking for/i,
  /\bsorry,?\s*we couldn['']?t find/i,
  /\bnothing (?:matches|found here)\b/i,
];

const TITLE_PATTERNS = [
  /404/,
  /not found/i,
  /page not found/i,
  /sorry/i,
  /oops/i,
  /error/i,
];

const THIN_WORD_THRESHOLD = 100;

export async function findSoft404s(opts: {
  startUrl: string;
  maxPages?: number;
}): Promise<Soft404Result> {
  const maxPages = Math.min(opts.maxPages ?? 100, 300);

  let host = "";
  try {
    host = new URL(opts.startUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return empty("Invalid start URL");
  }

  const { pages: crawled } = await crawlSite({
    startUrl: opts.startUrl,
    maxPages,
    maxDepth: 4,
    respectRobots: true,
  });

  const htmlPages = crawled
    .filter((p) => p.isHtml && p.status >= 200 && p.status < 300)
    .map((p) => p.url);

  if (htmlPages.length === 0) return empty("Crawl returned no HTML pages.");

  const flagged: SoftFourOhFour[] = [];

  await Promise.all(
    htmlPages.slice(0, maxPages).map(async (u) => {
      const r = await checkOne(u, host);
      if (r) flagged.push(r);
    }),
  );

  flagged.sort((a, b) => a.wordCount - b.wordCount);

  return {
    ok: true,
    pagesChecked: htmlPages.length,
    flagged,
  };
}

async function checkOne(
  url: string,
  // Reserved: soft-404 heuristics may need the host to spot
  // "redirected to homepage" patterns. Kept in the signature so the
  // call site stays readable.
  _host: string,
): Promise<SoftFourOhFour | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: ac.signal,
      redirect: "follow",
    });
    if (res.status < 200 || res.status >= 300) return null;
    const html = (await res.text()).slice(0, 800_000);

    // Check title for 404-like wording
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    for (const re of TITLE_PATTERNS) {
      if (re.test(title)) {
        const text = extractMainText(html);
        return {
          url,
          status: res.status,
          reason: "404-title-pattern",
          detail: `Title "${title.slice(0, 60)}" matches a 404 pattern but page returns 200.`,
          wordCount: countWords(text),
        };
      }
    }

    // Extract main text (strip nav / footer / aside / script / style)
    const text = extractMainText(html);
    const wordCount = countWords(text);

    // 404-like body text patterns
    for (const re of TEXT_PATTERNS) {
      if (re.test(text)) {
        return {
          url,
          status: res.status,
          reason: "404-text-pattern",
          detail: `Body contains 404-like text but page returns 200.`,
          wordCount,
        };
      }
    }

    // Thin content
    if (wordCount < THIN_WORD_THRESHOLD) {
      const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const hasH1 = !!h1Match && stripTags(h1Match[1]).trim().length > 0;
      if (!hasH1) {
        return {
          url,
          status: res.status,
          reason: "no-h1-thin",
          detail: `${wordCount} words, no H1. Likely a stub page.`,
          wordCount,
        };
      }
      return {
        url,
        status: res.status,
        reason: "thin-content",
        detail: `Only ${wordCount} words of visible content.`,
        wordCount,
      };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extractMainText(html: string): string {
  return stripTags(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ");
}

function empty(error: string): Soft404Result {
  return { ok: false, pagesChecked: 0, flagged: [], error };
}
