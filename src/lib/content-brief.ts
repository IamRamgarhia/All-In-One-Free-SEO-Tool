export type SerpResult = {
  url: string;
  title: string;
};

export type CompetitorOutline = {
  url: string;
  title: string;
  headings: { heading: string; level: number }[];
  wordCount: number;
};

export type GeneratedBrief = {
  targetKeyword: string;
  suggestedTitle: string;
  targetWordCount: number;
  outline: { heading: string; level: number }[];
  paaQuestions: string[];
  competitorTitles: { title: string; url: string }[];
};

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchHtml(url: string, timeoutMs = 8_000): Promise<string | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: c.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Pull top N organic results from DuckDuckGo HTML version.
 * No JS rendering required — works with plain fetch.
 */
export async function searchTopResults(
  query: string,
  count = 5,
): Promise<SerpResult[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url, 10_000);
  if (!html) return [];

  // DDG HTML uses <a class="result__a" href="...">title</a>
  // The href is sometimes a redirect like /l/?uddg=https://...
  const re =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const results: SerpResult[] = [];
  const seenHosts = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let href = m[1];
    // Unwrap DDG redirect URLs
    if (href.startsWith("/")) {
      try {
        const abs = new URL(href, "https://duckduckgo.com");
        const target = abs.searchParams.get("uddg");
        if (target) href = target;
      } catch {
        continue;
      }
    } else if (href.startsWith("//")) {
      href = "https:" + href;
    }
    let host: string;
    try {
      host = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (seenHosts.has(host)) continue; // 1 result per domain
    seenHosts.add(host);
    const title = decode(m[2].replace(/<[^>]+>/g, "").trim());
    if (title) {
      results.push({ url: href, title });
    }
    if (results.length >= count) break;
  }
  return results;
}

/**
 * Pull "People Also Ask" style questions from DuckDuckGo (best effort —
 * DDG doesn't have PAA but they expose related searches we can use as
 * question seeds, plus we add common question prefixes).
 */
export async function fetchPaaQuestions(query: string): Promise<string[]> {
  // Heuristic: combine the query with classic PAA prefixes
  const prefixes = [
    "what is",
    "how to",
    "why is",
    "when to",
    "where to",
    "are",
    "is",
    "can you",
    "should i",
  ];
  const candidates = new Set<string>();

  // Use Google autocomplete with question seeds — far cheaper than scraping SERPs
  for (const prefix of prefixes) {
    const seed = `${prefix} ${query}`;
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=${encodeURIComponent(seed)}`;
    try {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 4_000);
      const res = await fetch(url, {
        signal: c.signal,
        headers: { "user-agent": USER_AGENT },
      });
      clearTimeout(t);
      if (!res.ok) continue;
      const data = (await res.json()) as [string, string[]];
      if (Array.isArray(data[1])) {
        for (const s of data[1]) {
          // Only accept genuine questions (start with question word)
          if (
            /^(what|how|why|when|where|who|which|are|is|can|should|do|does|will)\b/i.test(
              s,
            )
          ) {
            candidates.add(s.charAt(0).toUpperCase() + s.slice(1) + "?");
          }
        }
      }
    } catch {
      // ignore
    }
    if (candidates.size > 12) break;
  }

  return Array.from(candidates).slice(0, 12);
}

export async function fetchOutline(
  url: string,
): Promise<CompetitorOutline | null> {
  const html = await fetchHtml(url, 8_000);
  if (!html) return null;

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].trim()) : "";

  const headings: { heading: string; level: number }[] = [];
  const re = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const level = Number(m[1]);
    const text = decode(
      m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    );
    if (text && text.length > 1 && text.length < 200) {
      headings.push({ heading: text, level });
    }
  }

  // Word count (rough)
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const wordCount = decode(stripped).trim().split(/\s+/).length;

  return { url, title, headings, wordCount };
}

/**
 * Aggregate competitor outlines into a suggested brief.
 * Heuristic: keep H2s/H3s that appear in 2+ competitors (consensus = important).
 */
function aggregateOutline(
  outlines: CompetitorOutline[],
): { heading: string; level: number }[] {
  const counts = new Map<string, { level: number; count: number }>();
  for (const o of outlines) {
    const seen = new Set<string>();
    for (const h of o.headings) {
      // Normalize: lowercase, strip punctuation for grouping
      const key = h.heading.toLowerCase().replace(/[^\w\s]/g, "").trim();
      if (key.length < 3 || seen.has(key)) continue;
      seen.add(key);
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        if (h.level < existing.level) existing.level = h.level;
      } else {
        counts.set(key, { level: h.level, count: 1 });
      }
    }
  }

  const popular = Array.from(counts.entries())
    .filter(
      ([, v]) => v.count >= 2 && v.level >= 2 && v.level <= 4,
    )
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12);

  // Use the original casing of the first occurrence (find back in outlines)
  const result: { heading: string; level: number }[] = [];
  for (const [key, v] of popular) {
    let original = key;
    for (const o of outlines) {
      const match = o.headings.find(
        (h) => h.heading.toLowerCase().replace(/[^\w\s]/g, "").trim() === key,
      );
      if (match) {
        original = match.heading;
        break;
      }
    }
    result.push({ heading: original, level: v.level });
  }
  return result;
}

/**
 * Full brief generator. Steps:
 *   1. Search top 5 results for the keyword (DuckDuckGo)
 *   2. Fetch each result's outline (h1/h2/h3 + word count)
 *   3. Aggregate consensus headings + average word count
 *   4. Pull PAA-style questions from autocomplete
 *
 * Total time: ~15-25 seconds. Returns null if SERP scrape fails.
 */
export async function generateContentBrief(
  targetKeyword: string,
): Promise<GeneratedBrief | null> {
  const topResults = await searchTopResults(targetKeyword, 5);
  if (topResults.length === 0) return null;

  const outlines = (
    await Promise.all(topResults.map((r) => fetchOutline(r.url)))
  ).filter((o): o is CompetitorOutline => o !== null);

  if (outlines.length === 0) return null;

  const avgWords = Math.round(
    outlines.reduce((s, o) => s + o.wordCount, 0) / outlines.length,
  );
  // Round to nearest 100 for readability
  const targetWordCount = Math.max(800, Math.round(avgWords / 100) * 100);

  const suggestedTitle = topResults[0].title;
  const aggregated = aggregateOutline(outlines);

  const paaQuestions = await fetchPaaQuestions(targetKeyword).catch(() => []);

  const competitorTitles = outlines
    .filter((o) => o.title)
    .map((o) => ({ title: o.title, url: o.url }));

  return {
    targetKeyword,
    suggestedTitle,
    targetWordCount,
    outline: aggregated,
    paaQuestions,
    competitorTitles,
  };
}
