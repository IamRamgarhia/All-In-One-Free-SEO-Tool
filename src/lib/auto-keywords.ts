/**
 * Auto keyword discovery for a client. Combines every free signal we
 * have access to:
 *
 *   1. **GSC** — if connected, real top queries the site already ranks for
 *      (positions 1-30, last 28 days). Highest signal possible.
 *   2. **Brand-derived seeds** — extracted from the site description /
 *      meta tags / niche tag. These become the autocomplete fan-out seeds.
 *   3. **AI seed expansion** — if an AI provider is configured, the LLM
 *      proposes 8-15 more seed phrases informed by the brand description.
 *   4. **Google autocomplete fan-out** — for every seed, alphabet + LSI
 *      modifier expansion (the same engine the keyword research page uses).
 *   5. **Wikipedia + Reddit** — entity / discussion phrase mining.
 *
 * Output: ranked, deduped keyword list with intent + recommended priority,
 * scored on a simple model (longer-tail + commercial intent + local
 * modifier match = higher).
 */

import { researchKeywords, type KeywordSuggestion } from "./keyword-research";
import { getGscTopQueries } from "./google-data";
import { callAI } from "./ai-call";

export type AutoKeywordSource =
  | "gsc"
  | "ai_seed"
  | "autocomplete"
  | "wikipedia"
  | "reddit";

export type DiscoveredKeyword = {
  query: string;
  intent: KeywordSuggestion["intent"];
  source: AutoKeywordSource;
  /** 0-100 — higher = better target. */
  score: number;
  /** When source=gsc, real impressions over last 28 days. */
  impressions?: number;
  position?: number;
  isLocal: boolean;
  isLongTail: boolean;
};

export type DiscoveryInput = {
  clientName: string;
  domain: string;
  niche?: string | null;
  description?: string | null;
  city?: string | null;
  country: string;
  /** Optional: derived business type for local-niche seeding. */
  businessTypeFromDesc?: string;
  /** GSC site URL — if set, real-data seeding kicks in. */
  gscProperty?: string | null;
  /** Maximum total keywords to return. */
  limit?: number;
};

export async function discoverKeywords(
  input: DiscoveryInput,
): Promise<{
  keywords: DiscoveredKeyword[];
  seedsUsed: string[];
  gscRowsUsed: number;
}> {
  const limit = input.limit ?? 80;
  const seenQueries = new Map<string, DiscoveredKeyword>();

  // 1. GSC seed (if connected)
  let gscRowsUsed = 0;
  if (input.gscProperty) {
    try {
      const rows = await getGscTopQueries({
        siteUrl: input.gscProperty,
        days: 28,
        limit: 60,
      });
      gscRowsUsed = rows.length;
      for (const r of rows) {
        const q = r.query.toLowerCase();
        if (!q || seenQueries.has(q)) continue;
        seenQueries.set(q, scoreKeyword({
          query: r.query,
          intent: classifyIntentSimple(r.query),
          source: "gsc",
          impressions: r.impressions,
          position: r.position,
          city: input.city,
        }));
      }
    } catch {
      // Silent — GSC errors fall back to non-GSC discovery.
    }
  }

  // 2. AI seed expansion
  const aiSeeds = await aiSeedKeywords(input);

  // 3. Brand seeds — derived from niche + description + (optionally) city
  const baseSeeds = brandSeeds(input);

  // The brand name is deliberately NOT a seed.
  //
  // Google autocomplete on a small brand returns whatever bigger thing
  // shares those words. Seeding "Dice Codes" — a web agency — produced
  // "dice codes discount", "dice discount code nhs" and "dice codes for
  // monopoly go": a ticketing app and a mobile game, sixty keywords of
  // them, every one about somebody else's business.
  //
  // That is not a bad autocomplete result, it is the wrong question. A
  // business that needs SEO help is by definition one nobody searches
  // for by name yet, so its own name is the least useful seed it has.
  // What it does and where it does it are the useful ones.
  //
  // It stays as a last resort below, because no seeds at all is worse.
  const allSeeds = Array.from(
    new Set(
      [
        ...baseSeeds,
        ...aiSeeds,
      ]
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s && s.length >= 2 && s.length <= 60),
    ),
  ).slice(0, 12); // cap fan-out — autocomplete is fast but not infinite

  // Nothing to go on: no description, no niche, no city, no AI. The
  // brand name is a poor seed and better than returning an empty list,
  // so it is used and the caller is told that is what happened.
  if (allSeeds.length === 0) {
    allSeeds.push(input.clientName.trim().toLowerCase());
  }

  // Suggestions that belong to a different company.
  //
  // Even with better seeds, autocomplete pulls in coupon, mod-apk and
  // game-code queries whenever the brand's words overlap something
  // bigger. None of them describe a service a client sells, and every
  // one that reaches the list is a keyword somebody would have tracked
  // for a year.
  const HIJACK =
    /\b(discount code|coupon|promo code|voucher|redeem|mod apk|apk|cheat|hack|free spins|dice roll)\b/i;

  // 4. Google autocomplete fan-out (small LSI mode for each seed)
  for (const seed of allSeeds) {
    try {
      const result = await researchKeywords(seed, {
        country: input.country,
        mode: "lsi",
        source: "google",
      });
      for (const s of result.suggestions) {
        const key = s.query.toLowerCase();
        if (seenQueries.has(key)) continue;
        // A retailer legitimately wants "discount code" queries. Nobody
        // else does, and for everybody else they are the signature of
        // autocomplete answering about a different company entirely.
        if (HIJACK.test(key) && input.niche !== "ecommerce") continue;
        seenQueries.set(
          key,
          scoreKeyword({
            query: s.query,
            intent: s.intent,
            source: "autocomplete",
            city: input.city,
          }),
        );
        if (seenQueries.size >= limit * 2) break;
      }
      if (seenQueries.size >= limit * 2) break;
    } catch {
      continue;
    }
  }

  // Sort by score desc, take top N
  const keywords = Array.from(seenQueries.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    keywords,
    seedsUsed: allSeeds,
    gscRowsUsed,
  };
}

/**
 * The strongest few words describing what the business does.
 *
 * Taken from the first sentence of the description, which is where
 * people put it. Returns null rather than guessing — a wrong subject
 * seeds sixty wrong keywords, and no subject just means fewer seeds.
 */
export function descriptorFor(input: DiscoveryInput): string | null {
  // The business type first, always.
  //
  // It is a field the user filled in with exactly this — "bakery",
  // "dentist", "SaaS", "software development" — so it is both precise
  // and already a phrase people search. Mining it out of prose is what
  // you do when nobody told you, and it is much worse at it: the first
  // attempt returned "builds fast seo-friendly", a verb and two
  // adjectives, which seeded "builds fast seo-friendly agency".
  const stated = (input.businessTypeFromDesc ?? "").trim().toLowerCase();
  if (stated.length >= 3) return stated;

  const phrases = servicePhrases(input);
  return phrases[0] ?? null;
}

/**
 * Words that start a clause about the company rather than name a thing
 * it sells.
 *
 * "builds fast websites" and "delivers SEO" are both about the business,
 * and neither is a search. Dropping the verb leaves the noun phrase that
 * is — "fast websites", "SEO".
 */
const ACTION_WORDS = new Set([
  "builds", "build", "building", "delivers", "deliver", "delivering",
  "grows", "grow", "growing", "helps", "help", "helping", "provides",
  "provide", "providing", "offers", "offer", "offering", "creates",
  "create", "creating", "makes", "make", "making", "specialises",
  "specializes", "works", "serving", "serves", "designs", "design",
]);

/**
 * Noun phrases from the description that could plausibly be searched.
 *
 * Two filters do the work. The brand's own words come out first — the
 * description almost always opens with the company name, so without this
 * the first bigram IS the brand and the whole point of not seeding on it
 * is lost. Then anything starting with a verb goes, because a clause
 * about what the company does is not a phrase anyone types.
 */
export function servicePhrases(input: DiscoveryInput): string[] {
  const desc = (input.description ?? "").trim();
  if (!desc) return [];

  const brandWords = new Set(
    input.clientName.toLowerCase().split(/\s+/).filter(Boolean),
  );

  const tokens = desc
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(
      (w) => w.length > 3 && !STOP_WORDS.has(w) && !brandWords.has(w),
    );

  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (ACTION_WORDS.has(tokens[i]) || ACTION_WORDS.has(tokens[i + 1])) continue;
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out.slice(0, 5);
}

export function brandSeeds(input: DiscoveryInput): string[] {
  const seeds: string[] = [];
  // Strip stop-suffixes from the brand for a cleaner seed
  const cleanedName = input.clientName.replace(
    /\b(inc|llc|ltd|co|corp|company)\b\.?/gi,
    "",
  ).trim();
  if (cleanedName && cleanedName !== input.clientName) seeds.push(cleanedName);

  const niche = input.niche;
  if (niche) {
    const nicheTerms: Record<string, string[]> = {
      local: ["near me", "service", "local"],
      ecommerce: ["buy", "shop", "online"],
      saas: ["software", "platform", "tool"],
      blog: ["guide", "tips", "blog"],
      services: ["service", "agency", "expert"],
    };
    // Attached to what the business DOES, not to what it is called.
    // "dice codes agency" is a search nobody performs; "web design
    // agency ludhiana" is one its customers actually type.
    const subject =
      descriptorFor(input) ?? input.businessTypeFromDesc ?? null;
    if (subject) {
      for (const t of nicheTerms[niche] ?? []) {
        seeds.push(`${subject} ${t}`);
      }
      if (input.city) seeds.push(`${subject} ${input.city}`);
    }
  }

  // Phrases from the description, brand words and verbs removed.
  //
  // This used to build every bigram in the text and keep the ones
  // appearing twice. In a three-sentence description nothing appears
  // twice, so it contributed nothing — and when the frequency filter
  // came off it contributed "codes builds" and "websites delivers",
  // which is worse than nothing.
  seeds.push(...servicePhrases(input));

  // Local-niche city seeds
  if (input.city && input.niche === "local") {
    if (input.businessTypeFromDesc) {
      seeds.push(`${input.businessTypeFromDesc} ${input.city}`);
    }
    seeds.push(`${input.clientName} ${input.city}`);
  }

  return seeds;
}

const STOP_WORDS = new Set([
  "this", "that", "with", "from", "have", "your", "their", "ours", "they",
  "them", "those", "these", "into", "about", "more", "most", "some", "such",
  "than", "then", "what", "when", "where", "while", "would", "could", "should",
  "been", "being", "here", "there", "very", "just", "only", "also", "like",
]);

function classifyIntentSimple(query: string): KeywordSuggestion["intent"] {
  const q = query.toLowerCase();
  if (/(buy|price|cost|cheap|deal|near\s+me|book|hire)/.test(q))
    return "transactional";
  if (/(best|top|review|vs|compare|alternative)/.test(q)) return "commercial";
  if (/(login|account|app|download)/.test(q)) return "navigational";
  return "informational";
}

function scoreKeyword(opts: {
  query: string;
  intent: KeywordSuggestion["intent"];
  source: AutoKeywordSource;
  impressions?: number;
  position?: number;
  city?: string | null;
}): DiscoveredKeyword {
  const wordCount = opts.query.trim().split(/\s+/).length;
  const isLongTail = wordCount >= 3;
  const isLocal = opts.city ? opts.query.toLowerCase().includes(opts.city.toLowerCase()) : false;

  let score = 30;
  // GSC keywords are gold — they're real traffic
  if (opts.source === "gsc") {
    score = 60;
    if (opts.impressions && opts.impressions > 100) score += 15;
    if (opts.position && opts.position >= 4 && opts.position <= 15) score += 15; // striking distance
  } else if (opts.source === "ai_seed") {
    score = 45;
  } else if (opts.source === "autocomplete") {
    score = 35;
  }

  if (isLongTail) score += 10;
  if (opts.intent === "commercial") score += 8;
  if (opts.intent === "transactional") score += 12;
  if (isLocal) score += 8;
  if (wordCount === 1) score -= 10; // single-word usually too generic

  return {
    query: opts.query,
    intent: opts.intent,
    source: opts.source,
    score: Math.min(100, Math.max(0, Math.round(score))),
    impressions: opts.impressions,
    position: opts.position,
    isLongTail,
    isLocal,
  };
}

const AI_SEED_SYSTEM = `You are a senior SEO. Given a website's name, domain, niche, and a short description, propose 8-12 SEED keyword phrases that the site should target.

Rules:
- 1-4 words each
- Mix of generic (1-2 word) and specific (3-4 word)
- Reflect what real customers search for, not what the company calls itself internally
- Avoid the brand name itself (those are navigational)
- One phrase per line. No numbering, no bullets, no quotes.
- Lowercase.`;

async function aiSeedKeywords(input: DiscoveryInput): Promise<string[]> {
  const userPrompt = [
    `Site: ${input.clientName}`,
    `Domain: ${input.domain}`,
    input.niche ? `Niche: ${input.niche}` : "",
    input.description ? `Description: ${input.description.slice(0, 300)}` : "",
    input.city ? `City: ${input.city}` : "",
    "",
    "Output 8-12 seed keyword phrases. Lowercase, one per line, no numbering.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await callAI({
      system: AI_SEED_SYSTEM,
      user: userPrompt,
      maxTokens: 300,
      temperature: 0.4,
      timeoutMs: 25_000,
    });
    if (!raw) return [];
    return raw
      .split(/\r?\n/)
      .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim().toLowerCase())
      .filter((l) => l && l.length >= 2 && l.length <= 60 && !/^[0-9]+$/.test(l))
      .slice(0, 12);
  } catch {
    return [];
  }
}

