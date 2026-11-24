/**
 * Google results from a paid SERP API, when the workspace has set one up
 * (Settings → Rank sources). Optional, and asked after the free sources
 * (Search Console, SearXNG, Brave): without a key, rank checks go on with
 * a browser on Google, then DuckDuckGo.
 *
 * Why it exists: a browser on Google from a server gets captchas and
 * personalised or partial pages, and the fallback is another engine. A
 * position in a client's report has to be Google's, from the country the
 * client sells in, every time. Two providers, both pay-per-use:
 *
 *   - Serper (serper.dev): one API key, Google results by country and
 *     language, up to 100 per call.
 *   - DataForSEO: login + password, Google organic results by country,
 *     language and device, up to 100 per call ("live" mode).
 *
 * Prices change; the settings page links to each provider's pricing
 * instead of quoting a figure here.
 */

import { decrypt } from "./crypto";
import { countryName, normaliseCountry } from "./countries";
import { getSetting } from "./settings-store";

export type SerpProvider = "serper" | "dataforseo";

export type SerpApiConfig =
  | { provider: "serper"; apiKey: string }
  | { provider: "dataforseo"; login: string; password: string };

export type SerpQuery = {
  query: string;
  country?: string;
  language?: string;
  device?: "desktop" | "mobile";
  /** How many organic results to ask for (max 100). */
  depth?: number;
};

export type SerpApiResult =
  | { ok: true; provider: SerpProvider; urls: string[] }
  | { ok: false; provider: SerpProvider; error: string };

export function isSerpProvider(value: unknown): value is SerpProvider {
  return value === "serper" || value === "dataforseo";
}

/** The configured provider with its credentials, or null when none is usable. */
export async function serpApiConfig(): Promise<SerpApiConfig | null> {
  const provider = await getSetting<string>("serp.provider");
  if (!isSerpProvider(provider)) return null;
  if (provider === "serper") {
    const stored = await getSetting<string>("serp.serper_key");
    const apiKey = stored ? decrypt(stored) : null;
    return apiKey ? { provider, apiKey } : null;
  }
  const login = await getSetting<string>("serp.dataforseo_login");
  const stored = await getSetting<string>("serp.dataforseo_password");
  const password = stored ? decrypt(stored) : null;
  return login && password ? { provider, login, password } : null;
}

/** Serper's answer: organic results in order. */
export function parseSerper(json: unknown): string[] {
  const organic = (json as { organic?: unknown })?.organic;
  if (!Array.isArray(organic)) return [];
  return organic
    .map((o) => (o as { link?: unknown; position?: unknown }) ?? {})
    .filter((o): o is { link: string; position?: number } => typeof o.link === "string")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((o) => o.link);
}

/**
 * DataForSEO's answer: organic items by rank_group (the position among
 * organic results, which is what a rank tracker reports; rank_absolute
 * also counts ads and features).
 */
export function parseDataForSeo(json: unknown): { urls: string[]; error?: string } {
  const body = json as {
    status_code?: number;
    status_message?: string;
    tasks?: { status_code?: number; status_message?: string; result?: { items?: unknown[] }[] }[];
  };
  if (body?.status_code !== 20000) {
    return { urls: [], error: body?.status_message ?? "DataForSEO error" };
  }
  const task = body.tasks?.[0];
  if (!task || task.status_code !== 20000) {
    return { urls: [], error: task?.status_message ?? "DataForSEO task error" };
  }
  const items = task.result?.[0]?.items ?? [];
  const organic = items
    .map((i) => i as { type?: string; url?: string; rank_group?: number })
    .filter((i) => i.type === "organic" && typeof i.url === "string")
    .sort((a, b) => (a.rank_group ?? 0) - (b.rank_group ?? 0));
  return { urls: organic.map((i) => i.url as string) };
}

const TIMEOUT_MS = 45_000;

/** Organic Google results for a query, from the configured provider. */
export async function fetchSerpViaApi(config: SerpApiConfig, q: SerpQuery): Promise<SerpApiResult> {
  const country = normaliseCountry(q.country);
  const language = (q.language ?? "en").toLowerCase().slice(0, 2);
  const depth = Math.min(100, Math.max(10, q.depth ?? 100));
  try {
    if (config.provider === "serper") {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.query, gl: country.toLowerCase(), hl: language, num: depth }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return { ok: false, provider: "serper", error: `Serper HTTP ${res.status}` };
      return { ok: true, provider: "serper", urls: parseSerper(await res.json()) };
    }
    const auth = Buffer.from(`${config.login}:${config.password}`).toString("base64");
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/regular", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          keyword: q.query,
          location_name: countryName(country),
          language_code: language,
          device: q.device ?? "desktop",
          depth,
        },
      ]),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false, provider: "dataforseo", error: `DataForSEO HTTP ${res.status}` };
    const parsed = parseDataForSeo(await res.json());
    return parsed.error
      ? { ok: false, provider: "dataforseo", error: parsed.error }
      : { ok: true, provider: "dataforseo", urls: parsed.urls };
  } catch (err) {
    return { ok: false, provider: config.provider, error: (err as Error).message };
  }
}
