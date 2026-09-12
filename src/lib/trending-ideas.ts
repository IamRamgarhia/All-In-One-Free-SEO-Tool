/**
 * Trending content idea finder. Given a topic + country, we pull signals
 * from four free sources and ask the AI to synthesise 10-15 article-ready
 * ideas:
 *
 *   1. Google Trends related queries (rising + top) — what's actually
 *      trending RIGHT NOW
 *   2. Google autocomplete with a-z prefix expansion — what people are
 *      typing
 *   3. People Also Ask + related searches scraped from a SERP
 *   4. Reddit search for the topic — what real humans are asking about
 *
 * All free. Browser automation only used for the SERP scrape (other
 * sources hit JSON endpoints that don't require headless).
 */

import { callAI, lastAiFailure } from "./ai-call";
import { scanSerp } from "./serp-scanner";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export type TrendingIdea = {
  title: string;
  format:
    | "how-to"
    | "listicle"
    | "comparison"
    | "guide"
    | "definition"
    | "case-study"
    | "news"
    | "opinion";
  rationale: string;
  /** Which signals fed this idea — for transparency. */
  sources: ("trends_rising" | "trends_top" | "autocomplete" | "paa" | "related" | "reddit")[];
};

export type TrendingResult = {
  ok: boolean;
  topic: string;
  country: string;
  signals: {
    trendsRising: string[];
    trendsTop: string[];
    autocomplete: string[];
    paa: string[];
    related: string[];
    reddit: string[];
  };
  ideas: TrendingIdea[];
  error?: string;
};

const SYSTEM_PROMPT = `You are a senior content strategist. The user gives you a topic and signals from Google Trends, autocomplete, People Also Ask, related searches, and Reddit. Synthesise 10-15 publish-ready content ideas.

Each idea must:
- Have a specific, click-worthy title (≤80 chars, sentence case)
- Be tied to a concrete signal in the data — not generic
- Mix formats: how-to / listicle / comparison / definition / case study / news / opinion
- Skip ideas that already saturate the SERP (avoid "What is X" if X is in 8 PAA results)
- Lean toward "rising" trends signals over "top" — these have less competition and more upside

Output JSON only — array of objects:
[{"title":"<title>","format":"<one of: how-to|listicle|comparison|guide|definition|case-study|news|opinion>","rationale":"<one short sentence>","sources":["<signal names>"]}]`;

export async function findTrendingIdeas(opts: {
  topic: string;
  country?: string;
  clientId?: number;
}): Promise<TrendingResult> {
  const country = (opts.country ?? "US").toUpperCase();

  const [trends, autocomplete, serp, reddit] = await Promise.all([
    fetchTrendsRelated(opts.topic, country).catch(() => ({ rising: [], top: [] })),
    fetchAutocomplete(opts.topic, country).catch(() => []),
    scanSerp({ query: opts.topic, country }).catch(() => null),
    fetchRedditQuestions(opts.topic).catch(() => []),
  ]);

  const signals = {
    trendsRising: trends.rising.slice(0, 12),
    trendsTop: trends.top.slice(0, 12),
    autocomplete: autocomplete.slice(0, 16),
    paa: (serp?.paaQuestions ?? []).slice(0, 8),
    related: (serp?.relatedSearches ?? []).slice(0, 8),
    reddit: reddit.slice(0, 12),
  };

  const totalSignals =
    signals.trendsRising.length +
    signals.trendsTop.length +
    signals.autocomplete.length +
    signals.paa.length +
    signals.related.length +
    signals.reddit.length;

  if (totalSignals < 4) {
    return {
      ok: false,
      topic: opts.topic,
      country,
      signals,
      ideas: [],
      error:
        "Couldn't gather enough trending signals. Google Trends + Reddit may be blocking from this IP — try adding a proxy in Settings → Headless browser pool.",
    };
  }

  const userPrompt = [
    `Topic: ${opts.topic}`,
    `Country: ${country}`,
    "",
    `Trends RISING (highest priority):`,
    ...signals.trendsRising.map((s) => `  - ${s}`),
    "",
    `Trends TOP:`,
    ...signals.trendsTop.map((s) => `  - ${s}`),
    "",
    `Autocomplete completions:`,
    ...signals.autocomplete.map((s) => `  - ${s}`),
    "",
    `People Also Ask:`,
    ...signals.paa.map((s) => `  - ${s}`),
    "",
    `Related searches:`,
    ...signals.related.map((s) => `  - ${s}`),
    "",
    `Reddit thread titles:`,
    ...signals.reddit.map((s) => `  - ${s}`),
    "",
    "Generate 10-15 content ideas. JSON array only.",
  ].join("\n");

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 1500,
    temperature: 0.6,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
  });

  if (!raw) {
    return {
      ok: false,
      topic: opts.topic,
      country,
      signals,
      ideas: [],
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Configure a key in Settings.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) {
    return {
      ok: false,
      topic: opts.topic,
      country,
      signals,
      ideas: [],
      error: "AI returned an unexpected format.",
    };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
    const ideas: TrendingIdea[] = [];
    for (const p of parsed) {
      if (!p || typeof p !== "object") continue;
      const o = p as {
        title?: unknown;
        format?: unknown;
        rationale?: unknown;
        sources?: unknown;
      };
      if (
        typeof o.title === "string" &&
        typeof o.format === "string" &&
        typeof o.rationale === "string"
      ) {
        ideas.push({
          title: o.title.trim().slice(0, 200),
          format: (o.format as TrendingIdea["format"]) ?? "guide",
          rationale: o.rationale.trim(),
          sources: Array.isArray(o.sources)
            ? (o.sources as unknown[]).filter(
                (s): s is TrendingIdea["sources"][number] => typeof s === "string",
              )
            : [],
        });
      }
    }
    return {
      ok: true,
      topic: opts.topic,
      country,
      signals,
      ideas: ideas.slice(0, 15),
    };
  } catch {
    return {
      ok: false,
      topic: opts.topic,
      country,
      signals,
      ideas: [],
      error: "Couldn't parse AI response.",
    };
  }
}

// =============== Source: Google Trends related queries ===============

async function fetchTrendsRelated(
  topic: string,
  country: string,
): Promise<{ rising: string[]; top: string[] }> {
  const explore = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(
    JSON.stringify({
      comparisonItem: [{ keyword: topic, geo: country, time: "today 3-m" }],
      category: 0,
      property: "",
    }),
  )}`;
  let exploreText: string;
  try {
    const res = await fetch(explore, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { rising: [], top: [] };
    exploreText = await res.text();
  } catch {
    return { rising: [], top: [] };
  }
  const cleaned = exploreText.replace(/^[^[{]*/, "");
  let exploreData: {
    widgets?: { id: string; token: string; request: unknown }[];
  };
  try {
    exploreData = JSON.parse(cleaned);
  } catch {
    return { rising: [], top: [] };
  }

  const widget = exploreData.widgets?.find((w) => w.id === "RELATED_QUERIES");
  if (!widget) return { rising: [], top: [] };

  const url = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=0&req=${encodeURIComponent(
    JSON.stringify(widget.request),
  )}&token=${widget.token}`;
  let text: string;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { rising: [], top: [] };
    text = await res.text();
  } catch {
    return { rising: [], top: [] };
  }
  try {
    const data = JSON.parse(text.replace(/^[^[{]*/, "")) as {
      default?: {
        rankedList?: {
          rankedKeyword?: { query?: string; value?: number }[];
        }[];
      };
    };
    const lists = data.default?.rankedList ?? [];
    const top = (lists[0]?.rankedKeyword ?? [])
      .map((k) => k.query)
      .filter((q): q is string => Boolean(q));
    const rising = (lists[1]?.rankedKeyword ?? [])
      .map((k) => k.query)
      .filter((q): q is string => Boolean(q));
    return { rising, top };
  } catch {
    return { rising: [], top: [] };
  }
}

// =============== Source: Google autocomplete (a-z prefix expansion) ===============

async function fetchAutocomplete(
  topic: string,
  country: string,
): Promise<string[]> {
  const prefixes = ["", " how", " what", " best", " vs", " for"];
  const out = new Set<string>();
  await Promise.all(
    prefixes.map(async (p) => {
      const q = `${topic}${p}`;
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=${country.toLowerCase()}&q=${encodeURIComponent(q)}`;
      try {
        const res = await fetch(url, {
          headers: { "user-agent": USER_AGENT },
          signal: AbortSignal.timeout(6_000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as [string, string[]];
        for (const s of data[1] ?? []) {
          if (s && s.length > topic.length) out.add(s);
        }
      } catch {
        // ignore
      }
    }),
  );
  return Array.from(out).slice(0, 30);
}

// =============== Source: Reddit search (free JSON endpoint) ===============

async function fetchRedditQuestions(topic: string): Promise<string[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=top&t=year&limit=25`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { children?: { data?: { title?: string; num_comments?: number } }[] };
    };
    const out = (data.data?.children ?? [])
      .map((c) => c.data?.title)
      .filter((t): t is string => Boolean(t) && (t as string).length < 200);
    return out.slice(0, 20);
  } catch {
    return [];
  }
}
