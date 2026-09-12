/**
 * Auto keyword discovery for a client. Combines every free signal we
 * have access to:
 *
 *   1. **The site itself** — the navigation, page titles, h1s and any
 *      Product schema across the main pages. This runs first and its
 *      seeds go first, because it is the only source that is the
 *      business's own words for the things it sells.
 *   2. **GSC** — if connected, real top queries the site already ranks for
 *      (positions 1-30, last 28 days). Highest signal possible.
 *   3. **Brand-derived seeds** — from the description and niche tag, for
 *      sites the reader could not get anything out of.
 *   4. **AI seed expansion** — if an AI provider is configured, the LLM
 *      proposes more seed phrases, shown the site's own vocabulary so it
 *      extends the range rather than inventing one.
 *   5. **Google autocomplete fan-out** — for every seed, alphabet + LSI
 *      modifier expansion (the same engine the keyword research page uses).
 *
 * Order matters and it changed for a reason. Discovery used to start at
 * step 3, seeding itself from `<meta name="description">` and nothing
 * else. On a client whose description happened to list its whole range
 * that produced excellent keywords, which hid the mechanism; a vague
 * description produced "welcome website near me" and a missing one
 * produced nothing at all.
 *
 * Output: ranked, deduped keyword list with intent + recommended priority,
 * scored on a simple model (longer-tail + commercial intent + local
 * modifier match = higher).
 */

import { researchKeywords, type KeywordSuggestion } from "./keyword-research";
import { getGscTopQueries } from "./google-data";
import { callAI } from "./ai-call";
import { expandProductList, looksB2B } from "./product-list";
import {
  readSiteVocabulary,
  vocabularySeeds,
  type SiteVocabulary,
  SEED_CONFIDENCE_FLOOR,
} from "./site-vocabulary";

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
  /**
   * An already-read vocabulary. Supplied by callers that read the site
   * for their own reasons (onboarding, the audit) so it is not fetched
   * twice, and by tests so this is runnable without a network.
   */
  siteVocabulary?: SiteVocabulary;
  /** Set false to skip reading the site. Default is to read it. */
  readSite?: boolean;
};

export async function discoverKeywords(
  input: DiscoveryInput,
): Promise<{
  keywords: DiscoveredKeyword[];
  seedsUsed: string[];
  gscRowsUsed: number;
  /** What reading the site produced, for provenance in the UI. */
  siteRead: {
    pagesRead: number;
    termsFound: number;
    seeds: string[];
    note?: string;
  };
}> {
  const limit = input.limit ?? 80;
  const seenQueries = new Map<string, DiscoveredKeyword>();

  // 0. Read the site.
  //
  // First, and its seeds go first, because the navigation and page
  // titles are the business naming its own products. Everything below
  // is a weaker proxy for that, and the tag this used to rely on is the
  // weakest of them.
  let vocab = input.siteVocabulary ?? null;
  if (!vocab && input.readSite !== false) {
    try {
      vocab = await readSiteVocabulary(input.domain, {
        brand: input.clientName,
      });
    } catch {
      // An unreadable site is a fallback, not a failure. The seeds
      // below still run.
      vocab = null;
    }
  }
  const siteSeeds = vocab ? vocabularySeeds(vocab, { limit: 8 }) : [];
  const enriched: DiscoveryInput = { ...input, siteVocabulary: vocab ?? undefined };

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
  const aiSeeds = await aiSeedKeywords(enriched);

  // 3. Brand seeds — derived from niche + description + (optionally) city
  const baseSeeds = brandSeeds(enriched);

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
        // The site's own words first, so the cap below can never drop
        // them in favour of something inferred from a meta tag.
        ...siteSeeds,
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
  // Every seed gets a share, rather than the first one taking the lot.
  //
  // The loop used to break out entirely at limit * 2, and autocomplete
  // returns plenty for any seed — so the first seed filled the quota and
  // the rest never ran. On a client selling five kinds of tape, all
  // twenty-four discovered keywords were about the first one. The other
  // four products, each a real search, were invisible.
  //
  // A floor of four, because a seed that contributes one keyword may as
  // well not have run, and dividing by a long seed list would do that to
  // all of them.
  const perSeed = Math.max(4, Math.ceil((limit * 2) / Math.max(1, allSeeds.length)));

  for (const seed of allSeeds) {
    try {
      const result = await researchKeywords(seed, {
        country: input.country,
        mode: "lsi",
        source: "google",
      });
      let fromThisSeed = 0;
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
        fromThisSeed++;
        if (fromThisSeed >= perSeed) break;
      }
      // The total cap still applies, so a long seed list cannot run away.
      if (seenQueries.size >= limit * 3) break;
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
    siteRead: {
      pagesRead: vocab?.pagesRead ?? 0,
      termsFound: vocab?.terms.length ?? 0,
      seeds: siteSeeds,
      note: vocab?.note ?? (vocab ? undefined : "the site was not read"),
    },
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
  // What the site itself calls its products, when it was readable.
  //
  // Ahead of everything below because it is the only source that is not
  // an inference. A nav label is a name the owner typed for a thing they
  // sell; every line after this one is an attempt to recover that from
  // prose, and each of them has been wrong on a real client.
  const fromSite = input.siteVocabulary
    ? vocabularySeeds(input.siteVocabulary, { limit: 6 })
    : [];
  if (fromSite.length > 0) return fromSite;

  const desc = (input.description ?? "").trim();
  if (!desc) return [];

  // The product range, when the description names one.
  //
  // Sliding a two-word window over the text after stripping punctuation
  // produced "tissue polyester" on a real client — two words adjacent
  // only because the comma between them had been deleted. The list
  // structure carries the meaning, so it is read before the punctuation
  // goes. Returns nothing unless it is confident, and the window below
  // still runs for descriptions that are prose rather than a range.
  const products = expandProductList(desc);
  if (products.length > 0) return products.slice(0, 6);

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

/**
 * Everything the business says about itself, in one string.
 *
 * The description plus every term read off its pages. Used for the
 * questions that are about the business rather than about one phrase —
 * is this trade or retail — where more of its own words is strictly
 * better evidence than one tag.
 */
export function businessVoice(input: DiscoveryInput): string {
  // Corroborated terms only. A bakery with "Bulk orders" in its nav and
  // nowhere else would otherwise read as a trade supplier and lose
  // "near me" from every seed — a false positive that costs a local
  // business the searches its customers actually type.
  const corroborated = (input.siteVocabulary?.terms ?? [])
    .filter((t) => t.confidence >= SEED_CONFIDENCE_FLOOR)
    .map((t) => t.term);
  return [
    input.description ?? "",
    // The homepage title, which is where a trade supplier says so. This
    // client's reads "Prateek Tapes — Adhesive Tape Manufacturer India
    // Since 1987" and is the only place on the site that says it.
    input.siteVocabulary?.selfDescription ?? "",
    ...corroborated,
  ]
    .filter(Boolean)
    .join(". ");
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
    // "near me" only for businesses whose customers are nearby.
    //
    // A tape manufacturer was tagged local, so every seed got "near me"
    // and all twelve discovered keywords were retail searches — "adhesive
    // tape shop near me" — for a company that manufactures and exports.
    // Nobody sourcing industrial tape types that; they type a city, a
    // country, or neither. The description decides, not the tag, because
    // the tag is one dropdown somebody picked in ten seconds.
    // Decided on everything the site said about itself, not on the
    // description alone. Plenty of manufacturers have a description that
    // never uses the word — but their nav says "Wholesale enquiry" and
    // their title says "…Manufacturer & Exporter", and getting this
    // wrong appends "near me" to every seed a trade supplier has.
    const b2b = looksB2B(businessVoice(input));
    const nicheTerms: Record<string, string[]> = {
      local: b2b
        ? ["manufacturer", "supplier", "wholesale"]
        : ["near me", "service", "local"],
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

const AI_SEED_SYSTEM = `You are a senior SEO. Given a website's name, domain, niche, a short description, and the words the site itself uses for what it sells, propose 8-12 SEED keyword phrases that the site should target.

Rules:
- 1-4 words each
- Mix of generic (1-2 word) and specific (3-4 word)
- Reflect what real customers search for, not what the company calls itself internally
- Avoid the brand name itself (those are navigational)
- Stay inside the business the site's own words describe. If those words say the company manufactures industrial tape, do not propose retail or hobby searches. Extend the range; do not invent a different one.
- If you cannot tell what the business sells, output nothing rather than guessing.
- One phrase per line. No numbering, no bullets, no quotes.
- Lowercase.`;

async function aiSeedKeywords(input: DiscoveryInput): Promise<string[]> {
  // The site's own vocabulary, given to the model as the thing to stay
  // inside. Without it the model has a name and a domain and fills the
  // gap: on a client whose title tag read "Home Page" it proposed
  // keywords for a mobile game that shares two words with the company.
  const ownWords = (input.siteVocabulary?.terms ?? [])
    .filter((t) => t.confidence >= SEED_CONFIDENCE_FLOOR)
    .slice(0, 20)
    .map((t) => t.term);

  const userPrompt = [
    `Site: ${input.clientName}`,
    `Domain: ${input.domain}`,
    input.niche ? `Niche: ${input.niche}` : "",
    input.description ? `Description: ${input.description.slice(0, 300)}` : "",
    ownWords.length > 0
      ? `What the site calls its own products and services: ${ownWords.join(", ")}`
      : "",
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

