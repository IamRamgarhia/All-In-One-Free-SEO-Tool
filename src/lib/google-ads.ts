import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, keywords } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
/**
 * `google-ads-api` is loaded on demand, not imported at the top.
 *
 * Its generated protobuf bundle (`google-ads-node`) is 120 MB — a
 * quarter of the prebuilt installer payload — for an integration that is
 * optional, gated behind three credentials most installs never set, and
 * whose availability to new applicants is in question (issue #57).
 * Keeping it out of the default download means this module has to cope
 * with it being absent, so the import happens where it is used and a
 * missing package becomes a sentence rather than a crash on boot.
 *
 * A static import here would also defeat the whole exercise: Next traces
 * it into the server bundle whether or not anyone has connected Ads.
 */
type AdsModule = typeof import("google-ads-api");

let adsModule: AdsModule | null = null;

/**
 * The one enum value this module needs, read from the library rather
 * than hardcoded — a wrong magic number here would be sent to Google as
 * a valid-looking request and come back with the wrong data, which is
 * worse than failing.
 */
async function googleSearchNetwork() {
  const { enums } = await loadAdsLibrary();
  return enums.KeywordPlanNetwork.GOOGLE_SEARCH;
}

async function loadAdsLibrary(): Promise<AdsModule> {
  if (adsModule) return adsModule;
  try {
    adsModule = (await import("google-ads-api")) as AdsModule;
    return adsModule;
  } catch {
    throw new Error(
      "The Google Ads add-on is not installed. It is a 120 MB optional " +
        "download kept out of the default install. Add it with " +
        "`pnpm add google-ads-api`, or use keyword research without it — " +
        "autocomplete, People Also Ask and related searches need no key.",
    );
  }
}
import { getGoogleClientCredentials } from "@/lib/google-oauth";
import { getSetting, setSetting } from "@/lib/settings-store";

/**
 * Google Ads Keyword Planner.
 *
 * The Google Ads API is free. It needs a Google Ads account (a manager
 * account is fine), a developer token and the `adwords` OAuth scope. The
 * token and customer ids are pasted in Settings -> Google; the browser
 * sign-in is its own button ("Connect Google Ads") and stores its own
 * refresh token, so it never touches the Search Console connection.
 *
 * Calls go through the open-source `google-ads-api` library (Opteo, MIT),
 * the same one the gsc-mcp Keyword Planner server uses.
 *
 * Accounts that do not spend on ads get volume ranges ("1K-10K") rather
 * than exact numbers, which Google returns as the bucket's lower bound.
 * That is still enough to rank ideas against each other.
 */

export type AdsConfig = {
  developerToken: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId: string | null;
  clientId: string;
  clientSecret: string;
};

export type KeywordIdea = {
  text: string;
  /** Average monthly searches over the last 12 months. */
  volume: number;
  competition: "LOW" | "MEDIUM" | "HIGH" | null;
  /** 0-100, how many advertisers bid on it. */
  competitionIndex: number | null;
  /** Top of page bid range in the account currency, null when unknown. */
  lowBid: number | null;
  highBid: number | null;
};

/** Google ids for `geoTargetConstants/<id>`, keyed by ISO country code. */
export const GEO_TARGETS: Record<string, number> = {
  US: 2840,
  GB: 2826,
  UK: 2826,
  CA: 2124,
  AU: 2036,
  IE: 2372,
  DE: 2276,
  FR: 2250,
  ES: 2724,
  IT: 2380,
  NL: 2528,
  PL: 2616,
  RO: 2642,
  BR: 2076,
  MX: 2484,
  IN: 2356,
};

/** Google ids for `languageConstants/<id>`, keyed by ISO 639-1 code. */
export const LANGUAGE_IDS: Record<string, number> = {
  en: 1000,
  de: 1001,
  fr: 1002,
  es: 1003,
  it: 1004,
  ja: 1005,
  da: 1009,
  nl: 1010,
  fi: 1011,
  ko: 1012,
  no: 1013,
  pt: 1014,
  sv: 1015,
  zh: 1017,
  pl: 1030,
  ru: 1031,
  tr: 1037,
  ro: 1032,
  ar: 1019,
  bg: 1020,
  cs: 1021,
  el: 1022,
  hi: 1023,
  hu: 1024,
  id: 1025,
  lv: 1028,
  lt: 1029,
  sk: 1033,
  sl: 1034,
  sr: 1035,
  uk: 1036,
  hr: 1039,
  vi: 1040,
  th: 1044,
  et: 1043,
};

/**
 * The language a market searches in, for clients whose profile language was
 * left at the default "en" although the site is local.
 */
const MARKET_LANGUAGE: Record<string, string> = {
  RO: "ro", DE: "de", AT: "de", FR: "fr", ES: "es", MX: "es", AR: "es",
  IT: "it", NL: "nl", PL: "pl", PT: "pt", BR: "pt", SE: "sv", NO: "no",
  DK: "da", FI: "fi", CZ: "cs", SK: "sk", HU: "hu", BG: "bg", GR: "el",
  HR: "hr", RS: "sr", SI: "sl", LT: "lt", LV: "lv", EE: "et", TR: "tr",
  RU: "ru", UA: "uk", JP: "ja", KR: "ko", ID: "id", VN: "vi", TH: "th",
};

/** Profile language, or the market's own when the profile still says "en". */
export function marketLanguage(
  country: string | null | undefined,
  language: string | null | undefined,
): string {
  const lang = (language ?? "en").toLowerCase();
  if (lang !== "en") return lang;
  return MARKET_LANGUAGE[(country ?? "").toUpperCase()] ?? "en";
}

export function geoTargetFor(country: string | null | undefined): string {
  const id = GEO_TARGETS[(country ?? "US").toUpperCase()] ?? GEO_TARGETS.US;
  return `geoTargetConstants/${id}`;
}

export function languageFor(language: string | null | undefined): string {
  const code = (language ?? "en").toLowerCase().split(/[-_]/)[0];
  return `languageConstants/${LANGUAGE_IDS[code] ?? LANGUAGE_IDS.en}`;
}

/** Customer ids are written "123-456-7890" in the Ads UI; the API wants digits. */
export function normalizeCustomerId(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

function num(v: unknown): number | null {
  // REST returns int64 values as strings; the library may use Long objects.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "object" ? String(v) : v);
  return Number.isFinite(n) ? n : null;
}

const COMPETITION: Record<string, KeywordIdea["competition"]> = {
  "2": "LOW",
  "3": "MEDIUM",
  "4": "HIGH",
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
};

/**
 * Parse a Keyword Planner response: the library's `results` array (snake
 * case, enums as numbers) or the REST body (camel case, enums as names).
 */
export function parseKeywordIdeas(json: unknown): KeywordIdea[] {
  const results = Array.isArray(json)
    ? json
    : (json as { results?: unknown[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  const out: KeywordIdea[] = [];
  for (const raw of results) {
    const r = raw as Record<string, unknown>;
    const text = typeof r.text === "string" ? r.text.trim() : "";
    if (!text) continue;
    const m = (r.keyword_idea_metrics ??
      r.keyword_metrics ??
      r.keywordIdeaMetrics ??
      r.keywordMetrics ??
      {}) as Record<string, unknown>;
    const pick = (snake: string, camel: string) => m[snake] ?? m[camel];
    const low = num(pick("low_top_of_page_bid_micros", "lowTopOfPageBidMicros"));
    const high = num(pick("high_top_of_page_bid_micros", "highTopOfPageBidMicros"));
    out.push({
      text,
      volume: num(pick("avg_monthly_searches", "avgMonthlySearches")) ?? 0,
      competition: COMPETITION[String(m.competition)] ?? null,
      competitionIndex: num(pick("competition_index", "competitionIndex")),
      lowBid: low === null ? null : low / 1_000_000,
      highBid: high === null ? null : high / 1_000_000,
    });
  }
  return out;
}

/**
 * Order ideas by how worth writing about they are: plenty of searches,
 * few advertisers fighting over them. Ideas below `minVolume`, longer
 * than `maxWords` or in `exclude` are dropped.
 */
export function rankIdeas(
  ideas: KeywordIdea[],
  opts: { exclude?: Iterable<string>; minVolume?: number; maxWords?: number } = {},
): KeywordIdea[] {
  const exclude = new Set(
    [...(opts.exclude ?? [])].map((k) => k.trim().toLowerCase()),
  );
  const minVolume = opts.minVolume ?? 50;
  const maxWords = opts.maxWords ?? 6;
  const seen = new Set<string>();
  const score = (i: KeywordIdea) =>
    Math.log10(i.volume + 1) * (1 - 0.6 * ((i.competitionIndex ?? 50) / 100));
  return ideas
    .filter((i) => {
      const key = i.text.toLowerCase();
      if (seen.has(key) || exclude.has(key)) return false;
      seen.add(key);
      return (
        i.volume >= minVolume && i.text.split(/\s+/).length <= maxWords
      );
    })
    .sort((a, b) => score(b) - score(a));
}

export async function getAdsConfig(): Promise<AdsConfig | null> {
  const [tokenRaw, customer, login, refreshRaw, creds] = await Promise.all([
    getSetting<string>("google_ads.developer_token"),
    getSetting<string>("google_ads.customer_id"),
    getSetting<string>("google_ads.login_customer_id"),
    getSetting<string>("google_ads.refresh_token"),
    getGoogleClientCredentials(),
  ]);
  const developerToken = tokenRaw ? decrypt(tokenRaw) : null;
  const refreshToken = refreshRaw ? decrypt(refreshRaw) : null;
  const customerId = normalizeCustomerId(customer);
  if (!developerToken || !refreshToken || !customerId || !creds) return null;
  return {
    developerToken,
    refreshToken,
    customerId,
    loginCustomerId: normalizeCustomerId(login),
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
  };
}

export type AdsStatus = {
  hasToken: boolean;
  customerId: string | null;
  loginCustomerId: string | null;
  /** The browser sign-in for Google Ads was completed. */
  authorized: boolean;
  /** Developer token, customer id and the sign-in are all in place. */
  ready: boolean;
};

export async function getAdsStatus(): Promise<AdsStatus> {
  const [token, customer, login, refresh] = await Promise.all([
    getSetting<string>("google_ads.developer_token"),
    getSetting<string>("google_ads.customer_id"),
    getSetting<string>("google_ads.login_customer_id"),
    getSetting<string>("google_ads.refresh_token"),
  ]);
  const customerId = normalizeCustomerId(customer);
  return {
    hasToken: Boolean(token),
    customerId,
    loginCustomerId: normalizeCustomerId(login),
    authorized: Boolean(refresh),
    ready: Boolean(token && customerId && refresh),
  };
}

/**
 * One Keyword Planner request through the `google-ads-api` library, which
 * speaks the current Ads API version itself.
 */
async function planner(
  cfg: AdsConfig,
  call: "generateKeywordIdeas" | "generateKeywordHistoricalMetrics",
  body: Record<string, unknown>,
): Promise<unknown> {
  const { GoogleAdsApi } = await loadAdsLibrary();
  const api = new GoogleAdsApi({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    developer_token: cfg.developerToken,
  });
  const customer = api.Customer({
    customer_id: cfg.customerId,
    refresh_token: cfg.refreshToken,
    ...(cfg.loginCustomerId ? { login_customer_id: cfg.loginCustomerId } : {}),
  });
  try {
    const request = { customer_id: cfg.customerId, ...body } as never;
    return await customer.keywordPlanIdeas[call](request);
  } catch (err) {
    const e = err as {
      errors?: { message?: string }[];
      message?: string;
    };
    const reason = e.errors?.[0]?.message ?? e.message ?? String(err);
    if (/invalid_grant/.test(reason)) {
      throw new Error(
        "Google Ads sign-in expired. Use Connect Google Ads in Settings → Google again.",
      );
    }
    throw new Error(`Google Ads: ${reason}`);
  }
}

/** Keyword ideas for some seed keywords and/or a site, in one market. */
export async function generateKeywordIdeas(opts: {
  seeds?: string[];
  url?: string;
  country?: string | null;
  language?: string | null;
  limit?: number;
}): Promise<KeywordIdea[]> {
  const cfg = await getAdsConfig();
  if (!cfg) throw new Error("Google Ads is not connected (Settings → Google).");
  const seeds = (opts.seeds ?? []).filter(Boolean).slice(0, 20);
  if (seeds.length === 0 && !opts.url) {
    throw new Error("Give at least one seed keyword or a URL.");
  }
  const body: Record<string, unknown> = {
    language: languageFor(opts.language),
    geo_target_constants: [geoTargetFor(opts.country)],
    keyword_plan_network: await googleSearchNetwork(),
    include_adult_keywords: false,
    page_size: Math.min(opts.limit ?? 300, 1000),
  };
  if (seeds.length > 0 && opts.url) {
    body.keyword_and_url_seed = { url: opts.url, keywords: seeds };
  } else if (seeds.length > 0) {
    body.keyword_seed = { keywords: seeds };
  } else {
    body.url_seed = { url: opts.url };
  }
  const res = await planner(cfg, "generateKeywordIdeas", body);
  return parseKeywordIdeas(res);
}

/** Exact volume figures for keywords you already have. */
export async function keywordMetrics(opts: {
  keywords: string[];
  country?: string | null;
  language?: string | null;
}): Promise<KeywordIdea[]> {
  const cfg = await getAdsConfig();
  if (!cfg) throw new Error("Google Ads is not connected (Settings → Google).");
  const res = await planner(cfg, "generateKeywordHistoricalMetrics", {
    keywords: opts.keywords.slice(0, 1000),
    language: languageFor(opts.language),
    geo_target_constants: [geoTargetFor(opts.country)],
    keyword_plan_network: await googleSearchNetwork(),
  });
  return parseKeywordIdeas(res);
}

const CACHE_MS = 24 * 60 * 60 * 1000;

type CachedIdeas = { at: number; ideas: KeywordIdea[] };

/**
 * Ranked planner ideas for one client: seeded by the client's site and
 * tracked keywords, in the client's country and language, minus what is
 * already tracked. Cached for a day so scheduled runs do not each cost
 * an API call.
 */
export async function discoverClientKeywords(
  clientId: number,
  opts: { refresh?: boolean; limit?: number } = {},
): Promise<KeywordIdea[]> {
  const cacheKey = `google_ads.ideas.${clientId}` as const;
  if (!opts.refresh) {
    const cached = await getSetting<CachedIdeas>(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.ideas.slice(0, opts.limit ?? 50);
    }
  }
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return [];
  const tracked = await db
    .select({ query: keywords.query })
    .from(keywords)
    .where(eq(keywords.clientId, clientId));
  const trackedTexts = tracked.map((k) => k.query);
  const lang = marketLanguage(client.country, client.language);
  // The site on its own first, then the tracked keywords as seeds. A
  // single request with both returns far fewer ideas than the two apart.
  const batches = await Promise.all([
    generateKeywordIdeas({ url: client.url, country: client.country, language: lang }),
    trackedTexts.length > 0
      ? generateKeywordIdeas({
          seeds: trackedTexts.slice(0, 5),
          country: client.country,
          language: lang,
        })
      : Promise.resolve([]),
  ]);
  const raw = batches.flat();
  const ranked = rankIdeas(raw, { exclude: trackedTexts }).slice(0, 100);
  await setSetting(cacheKey, { at: Date.now(), ideas: ranked });
  return ranked.slice(0, opts.limit ?? 50);
}

const USED_KEEP = 60;

/**
 * Pick the next keywords to write about: the best-ranked ideas not used
 * in a recent run, so a daily blog schedule walks down the list instead
 * of repeating itself. Returns [] when Ads is not usable, so callers
 * can fall back to the tracked keywords.
 */
export async function pickPlannerKeywords(
  clientId: number,
  count = 2,
): Promise<string[]> {
  try {
    const status = await getAdsStatus();
    if (!status.ready) return [];
    const ideas = await discoverClientKeywords(clientId);
    const usedKey = `google_ads.used.${clientId}` as const;
    const used = (await getSetting<string[]>(usedKey)) ?? [];
    const usedSet = new Set(used.map((u) => u.toLowerCase()));
    let picks = ideas.filter((i) => !usedSet.has(i.text.toLowerCase()));
    // Every idea used once: start over from the best.
    if (picks.length === 0) picks = ideas;
    const chosen = picks.slice(0, count).map((i) => i.text);
    if (chosen.length > 0) {
      await setSetting(usedKey, [...chosen, ...used].slice(0, USED_KEEP));
    }
    return chosen;
  } catch (err) {
    console.warn(
      `[google-ads] planner keywords failed for client ${clientId}: ${(err as Error).message}`,
    );
    return [];
  }
}

/** Start tracking planner ideas. Returns how many were new. */
export async function trackKeywords(
  clientId: number,
  texts: string[],
): Promise<number> {
  const [client] = await db
    .select({ country: clients.country, language: clients.language })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return 0;
  let added = 0;
  for (const text of texts) {
    const query = text.trim().toLowerCase();
    if (!query) continue;
    const [dupe] = await db
      .select({ id: keywords.id })
      .from(keywords)
      .where(and(eq(keywords.clientId, clientId), eq(keywords.query, query)))
      .limit(1);
    if (dupe) continue;
    await db.insert(keywords).values({
      clientId,
      query,
      country: client.country ?? "US",
      language: client.language ?? "en",
      source: "planner",
    });
    added++;
  }
  return added;
}
