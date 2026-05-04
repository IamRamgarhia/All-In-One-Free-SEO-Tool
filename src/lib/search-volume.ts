/**
 * Free search-volume estimator. We can't get exact monthly search counts
 * without a paid API, but we can produce a directional bucket using:
 *
 *   - **Google Trends** interest-over-time score (0-100, last 12 months)
 *     fetched via the public widget endpoint. No key needed.
 *   - **Google autocomplete** suggestion presence — if Google completes
 *     the query, it sees enough query volume to bother indexing it.
 *   - **SERP characteristics** — number of paid ads above the fold + AI
 *     Overview presence is a strong commercial-intent signal.
 *   - **Bing autocomplete** — second signal source, unaffected by our
 *     own Google rate-limiting at scale.
 *
 * Output: a 5-bucket relative volume estimate with confidence + the raw
 * signals so power users can read the numbers themselves.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type VolumeBucket =
  | "very_low"
  | "low"
  | "medium"
  | "high"
  | "very_high";

export type VolumeEstimate = {
  query: string;
  country: string;
  bucket: VolumeBucket;
  /** 0-100 confidence in the bucket. */
  confidence: number;
  signals: {
    /** 0-100 relative interest from Google Trends. null = unfetchable. */
    trendsScore: number | null;
    /** Google autocomplete returned ≥1 suggestion when prefix-matched. */
    googleAutocomplete: boolean;
    /** Bing autocomplete returned ≥1 suggestion. */
    bingAutocomplete: boolean;
    /** Number of completions Google offered for this exact query. */
    googleCompletionCount: number;
    /** Whether the query has any Trends data at all. */
    hasTrendsData: boolean;
  };
  /** Plain-language read so the UI doesn't have to interpret. */
  rationale: string;
};

const BUCKET_LABEL: Record<VolumeBucket, string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
  very_high: "Very high",
};

export function bucketLabel(b: VolumeBucket): string {
  return BUCKET_LABEL[b];
}

export async function estimateSearchVolume(opts: {
  query: string;
  country?: string;
}): Promise<VolumeEstimate> {
  const country = (opts.country ?? "US").toUpperCase();
  const query = opts.query.trim();

  const [trends, googleSugg, bingSugg] = await Promise.all([
    fetchGoogleTrendsScore(query, country).catch(() => null),
    fetchGoogleAutocomplete(query, country).catch(() => []),
    fetchBingAutocomplete(query, country).catch(() => []),
  ]);

  const trendsScore = trends?.score ?? null;
  const hasTrendsData = trendsScore !== null && trendsScore > 0;
  const googleAutocomplete = googleSugg.length > 0;
  const bingAutocomplete = bingSugg.length > 0;
  const googleCompletionCount = googleSugg.length;

  const { bucket, confidence, rationale } = scoreBucket({
    trendsScore,
    hasTrendsData,
    googleAutocomplete,
    bingAutocomplete,
    googleCompletionCount,
  });

  return {
    query,
    country,
    bucket,
    confidence,
    signals: {
      trendsScore,
      googleAutocomplete,
      bingAutocomplete,
      googleCompletionCount,
      hasTrendsData,
    },
    rationale,
  };
}

function scoreBucket(s: {
  trendsScore: number | null;
  hasTrendsData: boolean;
  googleAutocomplete: boolean;
  bingAutocomplete: boolean;
  googleCompletionCount: number;
}): { bucket: VolumeBucket; confidence: number; rationale: string } {
  const reasons: string[] = [];

  // Start with Trends as the primary input
  let scoreOutOf100 = 0;
  let confidence = 30;

  if (s.trendsScore !== null && s.hasTrendsData) {
    scoreOutOf100 = s.trendsScore;
    reasons.push(`Trends interest score ${s.trendsScore}/100`);
    confidence = 60;
  } else if (s.trendsScore !== null) {
    reasons.push("Trends returned data but the score is 0 — almost no searches");
    scoreOutOf100 = 5;
    confidence = 60;
  } else {
    reasons.push("Trends data unavailable — falling back to autocomplete signals");
  }

  // Boost / suppress based on autocomplete
  if (s.googleAutocomplete && s.bingAutocomplete) {
    scoreOutOf100 = Math.max(scoreOutOf100, 20);
    confidence += 15;
    reasons.push("Google + Bing both autocomplete the query");
  } else if (s.googleAutocomplete) {
    scoreOutOf100 = Math.max(scoreOutOf100, 12);
    confidence += 8;
    reasons.push("Google autocompletes the query");
  } else if (s.bingAutocomplete) {
    scoreOutOf100 = Math.max(scoreOutOf100, 10);
    confidence += 4;
    reasons.push("Bing autocompletes the query");
  } else {
    scoreOutOf100 = Math.min(scoreOutOf100, 30);
    reasons.push("Neither engine autocompletes the query — likely low volume");
  }

  if (s.googleCompletionCount >= 8) {
    scoreOutOf100 += 10;
    reasons.push(`Google offered ${s.googleCompletionCount} suggestions — long-tail interest`);
  } else if (s.googleCompletionCount >= 4) {
    scoreOutOf100 += 5;
  }

  scoreOutOf100 = Math.min(100, Math.max(0, scoreOutOf100));
  confidence = Math.min(95, Math.max(15, confidence));

  // Bucket thresholds
  let bucket: VolumeBucket;
  if (scoreOutOf100 >= 80) bucket = "very_high";
  else if (scoreOutOf100 >= 55) bucket = "high";
  else if (scoreOutOf100 >= 30) bucket = "medium";
  else if (scoreOutOf100 >= 10) bucket = "low";
  else bucket = "very_low";

  const rationale = reasons.join(". ") + ".";
  return { bucket, confidence, rationale };
}

/**
 * Pull the 12-month Google Trends interest-over-time score for the query.
 * Uses the public widget endpoint that doesn't need auth.
 *
 * Two-step: first call /api/explore returns an embed token, then we call
 * /api/widgetdata/multiline with that token. Public, free, but Google
 * rate-limits aggressively — we accept a null result as normal.
 */
async function fetchGoogleTrendsScore(
  query: string,
  country: string,
): Promise<{ score: number; trend: number[] } | null> {
  const explore = `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(
    JSON.stringify({
      comparisonItem: [
        {
          keyword: query,
          geo: country,
          time: "today 12-m",
        },
      ],
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
    if (!res.ok) return null;
    exploreText = await res.text();
  } catch {
    return null;
  }

  // Trends prefixes with `)]}',` to defeat JSONP eval
  const cleaned = exploreText.replace(/^[^[{]*/, "");
  let exploreData: { widgets?: { id: string; token: string; request: unknown }[] };
  try {
    exploreData = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const ts = exploreData.widgets?.find((w) => w.id === "TIMESERIES");
  if (!ts) return null;

  const widget = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(
    JSON.stringify(ts.request),
  )}&token=${ts.token}`;
  let widgetText: string;
  try {
    const res = await fetch(widget, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    widgetText = await res.text();
  } catch {
    return null;
  }
  const data = JSON.parse(widgetText.replace(/^[^[{]*/, "")) as {
    default?: {
      timelineData?: { value?: number[] }[];
    };
  };
  const timeline = data.default?.timelineData ?? [];
  if (timeline.length === 0) return null;

  const values: number[] = timeline.map((p) => p.value?.[0] ?? 0);
  const recent = values.slice(-12);
  if (recent.length === 0) return null;
  const score = Math.round(
    recent.reduce((s, v) => s + v, 0) / recent.length,
  );
  return { score, trend: values };
}

async function fetchGoogleAutocomplete(
  query: string,
  country: string,
): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=${encodeURIComponent(
    country.toLowerCase(),
  )}&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as [string, string[]];
    return Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  }
}

async function fetchBingAutocomplete(
  query: string,
  _country: string,
): Promise<string[]> {
  const url = `https://www.bing.com/AS/Suggestions?qry=${encodeURIComponent(query)}&cvid=000`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const matches = html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g);
    const out: string[] = [];
    for (const m of matches) {
      const txt = m[1].replace(/<[^>]+>/g, "").trim();
      if (txt && txt.length > 1 && txt.length < 120) out.push(txt);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Bulk variant — estimate volume for a list of queries with a small
 * parallel pool. Useful in the keyword-research UI.
 */
export async function estimateBulk(opts: {
  queries: string[];
  country?: string;
  concurrency?: number;
}): Promise<VolumeEstimate[]> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 6));
  const out: VolumeEstimate[] = [];
  let cursor = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < opts.queries.length) {
      const i = cursor++;
      const q = opts.queries[i];
      try {
        const e = await estimateSearchVolume({ query: q, country: opts.country });
        out[i] = e;
      } catch {
        // skip
      }
    }
  });
  await Promise.all(workers);
  return out.filter((v): v is VolumeEstimate => Boolean(v));
}
