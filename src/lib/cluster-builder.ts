/**
 * Topic-cluster builder. Given a head topic + optional country, we mine:
 *   - PAA + Related searches (via SERP scanner) for the head topic
 *   - Autocomplete a-z prefix expansion
 *   - Reddit thread titles (free JSON endpoint)
 *
 * Then ask the AI to assemble a hub-and-spoke architecture:
 *   - 1 pillar page (the head topic done definitively)
 *   - 15-20 spoke pages, each with title + slug + 1-line angle + intent
 *   - Internal-linking map (which spokes link to which spokes)
 *
 * This is the kind of plan Backlinko / Yoast bloggers spend a day mapping
 * by hand. We do it in a minute.
 */

import { callAI } from "./ai-call";
import { scanSerp } from "./serp-scanner";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SeoToolBot/1.0; +https://example.com/bot)";

export type ClusterPage = {
  type: "pillar" | "spoke";
  title: string;
  slug: string;
  angle: string;
  intent: "informational" | "commercial" | "transactional" | "navigational" | "local";
  format: string;
  links: string[]; // slugs of other pages in this cluster
};

export type ClusterPlan = {
  ok: boolean;
  topic: string;
  country: string;
  pillar: ClusterPage | null;
  spokes: ClusterPage[];
  signals: {
    paa: string[];
    related: string[];
    autocomplete: string[];
    reddit: string[];
  };
  error?: string;
};

const SYSTEM_PROMPT = `You are a senior content strategist. Build a topic cluster for the head topic given. Output JSON only:

{
  "pillar": {
    "title": "<one definitive title for the hub page>",
    "slug": "/<slug-without-leading-slash-other-than-this>",
    "angle": "<one sentence: what makes this the canonical resource>",
    "intent": "informational|commercial|transactional|navigational|local",
    "format": "<ultimate guide | hub | listicle | comparison | etc>",
    "links": []
  },
  "spokes": [
    {
      "title": "<title>",
      "slug": "/<slug>",
      "angle": "<one-sentence purpose>",
      "intent": "informational|commercial|transactional|navigational|local",
      "format": "<how-to | listicle | comparison | definition | case study | review | tutorial>",
      "links": ["<2-4 sibling slugs that should link to this from each other or to the pillar>"]
    }
  ]
}

Rules:
- 15-20 spokes total (pillar is separate)
- Mix intents: at least 4 informational, at least 2 commercial, at least 1 transactional, plus comparisons / definitions where it fits
- Slugs are kebab-case, all lowercase, start with "/", under 60 chars
- Spoke titles must be specific. NOT "Beginner's guide to X". DO use "How to brew espresso in a moka pot under 5 minutes"
- Anchor every spoke in either a PAA question, related search, autocomplete completion, or Reddit thread we showed you. Don't invent topics
- "links" arrays should reference real other slugs in this same cluster (siblings + pillar), so the cluster interlinks coherently
- Output JSON ONLY. No prose. No code fences. No commentary.`;

export async function buildCluster(opts: {
  topic: string;
  country?: string;
  clientId?: number | null;
}): Promise<ClusterPlan> {
  const country = (opts.country ?? "US").toUpperCase();

  const [serp, autocomplete, reddit] = await Promise.all([
    scanSerp({ query: opts.topic, country }).catch(() => null),
    fetchAutocomplete(opts.topic, country),
    fetchReddit(opts.topic),
  ]);

  const signals = {
    paa: serp?.paaQuestions ?? [],
    related: serp?.relatedSearches ?? [],
    autocomplete: autocomplete.slice(0, 16),
    reddit: reddit.slice(0, 12),
  };

  const totalSignals =
    signals.paa.length +
    signals.related.length +
    signals.autocomplete.length +
    signals.reddit.length;
  if (totalSignals < 4) {
    return {
      ok: false,
      topic: opts.topic,
      country,
      pillar: null,
      spokes: [],
      signals,
      error:
        "Couldn't gather enough signal. Add a proxy in Settings → Headless browser pool, or try a less ambiguous head topic.",
    };
  }

  const userPrompt = [
    `Head topic: ${opts.topic}`,
    `Country: ${country}`,
    "",
    `People Also Ask:`,
    ...signals.paa.map((q) => `  - ${q}`),
    "",
    `Related searches:`,
    ...signals.related.map((s) => `  - ${s}`),
    "",
    `Autocomplete completions:`,
    ...signals.autocomplete.map((s) => `  - ${s}`),
    "",
    `Reddit thread titles:`,
    ...signals.reddit.map((s) => `  - ${s}`),
    "",
    "Build the topic cluster now. JSON only.",
  ].join("\n");

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 3000,
    temperature: 0.5,
    timeoutMs: 60_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
    ignoreCreditSaver: true,
  });

  if (!raw) {
    return {
      ok: false,
      topic: opts.topic,
      country,
      pillar: null,
      spokes: [],
      signals,
      error: "AI provider didn't respond. Configure a key in Settings.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return {
      ok: false,
      topic: opts.topic,
      country,
      pillar: null,
      spokes: [],
      signals,
      error: "AI returned an unexpected format.",
    };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      pillar?: unknown;
      spokes?: unknown;
    };
    const pillar = validatePage(parsed.pillar, "pillar");
    const spokes = Array.isArray(parsed.spokes)
      ? (parsed.spokes as unknown[])
          .map((s) => validatePage(s, "spoke"))
          .filter((s): s is ClusterPage => s !== null)
      : [];
    if (!pillar || spokes.length < 5) {
      return {
        ok: false,
        topic: opts.topic,
        country,
        pillar: null,
        spokes: [],
        signals,
        error: "AI didn't return a usable cluster.",
      };
    }
    return {
      ok: true,
      topic: opts.topic,
      country,
      pillar,
      spokes,
      signals,
    };
  } catch {
    return {
      ok: false,
      topic: opts.topic,
      country,
      pillar: null,
      spokes: [],
      signals,
      error: "Couldn't parse AI response.",
    };
  }
}

function validatePage(input: unknown, type: "pillar" | "spoke"): ClusterPage | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.slug !== "string") return null;
  return {
    type,
    title: o.title.trim().slice(0, 200),
    slug: o.slug.toString().trim(),
    angle: typeof o.angle === "string" ? o.angle.trim() : "",
    intent:
      typeof o.intent === "string" &&
      ["informational", "commercial", "transactional", "navigational", "local"].includes(
        o.intent,
      )
        ? (o.intent as ClusterPage["intent"])
        : "informational",
    format: typeof o.format === "string" ? o.format.trim() : "",
    links: Array.isArray(o.links)
      ? (o.links as unknown[]).filter((l): l is string => typeof l === "string")
      : [],
  };
}

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
  return Array.from(out);
}

async function fetchReddit(topic: string): Promise<string[]> {
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(topic)}&sort=top&t=year&limit=25`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { children?: { data?: { title?: string } }[] };
    };
    return (data.data?.children ?? [])
      .map((c) => c.data?.title)
      .filter((t): t is string => Boolean(t) && (t as string).length < 200)
      .slice(0, 20);
  } catch {
    return [];
  }
}
