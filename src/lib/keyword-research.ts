export type Intent = "informational" | "commercial" | "transactional" | "navigational";

export type KeywordSuggestion = {
  query: string;
  intent: Intent;
  wordCount: number;
  isLongTail: boolean;
};

export type KeywordSource = "google" | "youtube" | "reddit" | "wikipedia";

export type ResearchResult = {
  seed: string;
  country: string;
  source: KeywordSource;
  fetchedAt: Date;
  suggestions: KeywordSuggestion[];
};

const transactionalPatterns =
  /\b(buy|cheap|deal|deals|discount|coupon|sale|order|purchase|shop|near\s+me|free\s+shipping|book|hire|subscribe|pricing|price|cost|quote)\b/i;

const commercialPatterns =
  /\b(best|top|review|reviews|compare|vs|versus|alternative|alternatives|cheapest|under\s+\$?\d+|recommended|guide\s+to\s+buying|comparison)\b/i;

const informationalPatterns =
  /^(how|what|why|when|where|who|which|can|does|do|is|are|will|tutorial|guide|examples?|tips|ideas|learn|meaning|definition)\b|\b(explained|explain|tutorial|how\s+to|guide|examples?|tips)\b/i;

const navigationalPatterns =
  /\b(login|sign[\s-]?in|sign[\s-]?up|account|dashboard|app|download|contact|support|help\s+center|customer\s+service)\b/i;

function classifyIntent(query: string): Intent {
  if (transactionalPatterns.test(query)) return "transactional";
  if (commercialPatterns.test(query)) return "commercial";
  if (navigationalPatterns.test(query)) return "navigational";
  if (informationalPatterns.test(query)) return "informational";
  // default for short/ambiguous queries
  const words = query.trim().split(/\s+/).length;
  return words <= 2 ? "commercial" : "informational";
}

const suggestionAlphabet = "abcdefghijklmnopqrstuvwxyz".split("");

async function fetchSuggestions(
  query: string,
  country: string,
): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=${encodeURIComponent(country.toLowerCase())}&q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)",
        accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchYoutubeSuggestions(query: string): Promise<string[]> {
  // YouTube uses the same suggestqueries endpoint with ds=yt
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=en&q=${encodeURIComponent(query)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6_000);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      headers: { "user-agent": "Mozilla/5.0 SeoTool/0.1" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchWikipediaSuggestions(query: string): Promise<string[]> {
  // Wikipedia opensearch — returns article titles related to a query
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=${encodeURIComponent(query)}&limit=20&namespace=0`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6_000);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      headers: { "user-agent": "Mozilla/5.0 SeoTool/0.1" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[], string[], string[]];
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function fetchRedditSuggestions(query: string): Promise<string[]> {
  // Reddit search JSON — pull top post titles for the query
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=25&sort=relevance`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: c.signal,
      headers: {
        "user-agent": "SeoToolBot/0.1 (research)",
        accept: "application/json",
      },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { children?: { data?: { title?: string } }[] };
    };
    const titles =
      data.data?.children
        ?.map((c) => c.data?.title?.trim())
        .filter((t): t is string => !!t && t.length > 5 && t.length < 150) ??
      [];
    // Lower-case and dedupe
    const out = new Set<string>();
    for (const tt of titles) out.add(tt.toLowerCase());
    return Array.from(out).slice(0, 20);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

export type ExpansionMode = "none" | "alphabet" | "lsi";

// SEO modifier patterns used by every "LSI keyword tool" — these are what
// people actually search for around any seed term. Mix of:
// - question intents (what / how / why / when / where)
// - commercial modifiers (best / top / cheap / review / alternative)
// - comparison ("vs", "or", "like")
// - specifiers ("for", "without", "near me", "for beginners")
// - time ("2026", "today")
// We also flip a few to PREFIX form to catch question-shape queries.
const LSI_SUFFIXES = [
  "vs",
  "or",
  "like",
  "for",
  "without",
  "with",
  "alternatives",
  "alternative",
  "reviews",
  "review",
  "price",
  "cost",
  "near me",
  "for beginners",
  "for free",
  "online",
  "examples",
  "tutorial",
  "guide",
  "checklist",
  "tips",
  "2026",
];

const LSI_PREFIXES = [
  "best",
  "top",
  "cheap",
  "free",
  "how to",
  "what is",
  "why",
  "when to",
  "where to",
  "is",
  "are",
  "can",
  "should",
];

export async function researchKeywords(
  seed: string,
  options: {
    country?: string;
    expand?: boolean;
    mode?: ExpansionMode;
    source?: KeywordSource;
  } = {},
): Promise<ResearchResult> {
  const country = options.country ?? "US";
  const source = options.source ?? "google";
  // Back-compat: old `expand: true` maps to mode: "alphabet"
  const mode: ExpansionMode =
    options.mode ?? (options.expand ? "alphabet" : "none");
  const cleanedSeed = seed.trim();

  let baseSuggestions: string[];
  if (source === "youtube") {
    baseSuggestions = await fetchYoutubeSuggestions(cleanedSeed);
  } else if (source === "wikipedia") {
    baseSuggestions = await fetchWikipediaSuggestions(cleanedSeed);
  } else if (source === "reddit") {
    baseSuggestions = await fetchRedditSuggestions(cleanedSeed);
  } else {
    baseSuggestions = await fetchSuggestions(cleanedSeed, country);
  }

  const allSuggestions = new Set(baseSuggestions);

  // Expansion modes — only meaningful for Google source (others lack the
  // alphabet-soup pattern that makes fan-out useful).
  if (source === "google" && mode !== "none") {
    // Build the list of expansion queries to fan out
    const queries: string[] = [];

    // alphabet: append each letter
    for (const letter of suggestionAlphabet) {
      queries.push(`${cleanedSeed} ${letter}`);
    }

    if (mode === "lsi") {
      // LSI: also fan out with modifier suffixes + prefixes
      for (const suffix of LSI_SUFFIXES) {
        queries.push(`${cleanedSeed} ${suffix}`);
      }
      for (const prefix of LSI_PREFIXES) {
        queries.push(`${prefix} ${cleanedSeed}`);
      }
    }

    // run in parallel batches of 6 to balance speed vs. rate-limit risk
    const batchSize = 6;
    const softCap = mode === "lsi" ? 250 : 80;
    for (let i = 0; i < queries.length; i += batchSize) {
      const batch = queries.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((q) => fetchSuggestions(q, country)),
      );
      for (const list of results) {
        for (const s of list) allSuggestions.add(s);
      }
      if (allSuggestions.size > softCap) break;
    }
  }

  // Drop the seed itself if it appears, dedupe case-insensitively
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of allSuggestions) {
    const key = s.toLowerCase();
    if (key === cleanedSeed.toLowerCase()) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }

  const suggestions: KeywordSuggestion[] = unique.map((q) => {
    const wordCount = q.trim().split(/\s+/).length;
    return {
      query: q,
      intent: classifyIntent(q),
      wordCount,
      isLongTail: wordCount >= 4,
    };
  });

  return {
    seed: cleanedSeed,
    country,
    source,
    fetchedAt: new Date(),
    suggestions,
  };
}
