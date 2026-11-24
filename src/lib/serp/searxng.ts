/**
 * SearXNG as a rank source.
 *
 * SearXNG is an open-source metasearch engine: it queries Google, Bing,
 * Brave, DuckDuckGo and others server-side and merges the results.
 * Pointing this tool at one you run yourself gives ranked results with
 * no API key and no browser — the combination nothing else offers.
 *
 * SELF-HOSTED IS THE POINT. Public instances rate-limit automated use
 * quickly and most disable `format=json`; borrowing a volunteer's
 * instance for automated queries is spending their quota. The compose
 * file ships one behind the `searxng` profile (docs/HOSTING.md).
 *
 * `format=json` is OFF by default in SearXNG. docker/searxng/settings.yml
 * turns it on:
 *
 *     search:
 *       formats:
 *         - html
 *         - json
 *
 * Ported from the upstream project (src/lib/serp/searxng.ts), adapted:
 * failures are codes, not English sentences, so the interface can say
 * them in French.
 */

import { languageCode } from "./locale";
import { positionOf } from "./match";
import type { KeylessProvider, SerpLookup } from "./types";

/** SearXNG's JSON result rows, as far as we rely on them. */
type SearxResult = {
  url?: unknown;
  title?: unknown;
  engine?: unknown;
  engines?: unknown;
  positions?: unknown;
};

const TIMEOUT_MS = 20_000;

/** Trailing slashes break `${base}/search`; a scheme is required. */
export function normaliseInstanceUrl(raw: string): string | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  // A scheme that is not http(s) is refused, not overwritten: prepending
  // "https://" to "ftp://x.example" parses (as https://ftp//x.example)
  // and would be stored as an address the user never typed.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) {
    // "localhost:8888" looks like a scheme to that test. Let host:port through.
    if (!/^[a-z0-9.-]+:\d+(\/|$)/i.test(trimmed)) return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol)) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Pull the ordered result URLs out of a SearXNG JSON body.
 *
 * Exported for tests: this is the part that silently changes when
 * SearXNG does. Duplicates (same host and path, different query string)
 * count once. Order is the instance's own merge, which is the ranking.
 */
export function parseSearxResults(body: unknown): {
  urls: string[];
  engines: string[];
} {
  const results =
    body && typeof body === "object" && Array.isArray((body as { results?: unknown }).results)
      ? ((body as { results: SearxResult[] }).results)
      : [];

  const urls: string[] = [];
  const seen = new Set<string>();
  const engines = new Set<string>();

  for (const r of results) {
    if (typeof r?.url !== "string" || !r.url) continue;
    let key: string;
    try {
      const u = new URL(r.url);
      // A hostname with no dot is not a site anyone can rank on. A live
      // instance returned `http:///go/v1/…` (a tracking redirect with no
      // host): `new URL()` parses "go" as the hostname without
      // throwing, and the row would have taken a rank and pushed every
      // genuine result below it down one place.
      if (!u.hostname.includes(".")) continue;
      key = `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
    } catch {
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(r.url);

    if (typeof r.engine === "string") engines.add(r.engine);
    if (Array.isArray(r.engines)) {
      for (const e of r.engines) if (typeof e === "string") engines.add(e);
    }
  }

  return { urls, engines: [...engines].sort() };
}

/** Engines SearXNG reports as not answering, for the failure detail. */
function unresponsiveEngines(body: unknown): string[] {
  const list =
    body && typeof body === "object"
      ? (body as { unresponsive_engines?: unknown }).unresponsive_engines
      : undefined;
  if (!Array.isArray(list)) return [];
  return list
    .map((e) => (Array.isArray(e) ? `${e[0]}${e[1] ? ` (${e[1]})` : ""}` : null))
    .filter((e): e is string => Boolean(e));
}

/** The locale tag SearXNG expects: "fr-FR", or "fr" with no country. */
export function searxLanguage(language?: string, country?: string): string | null {
  const lang = languageCode(language);
  if (!lang) return null;
  const cc = (country ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cc) ? `${lang}-${cc}` : lang;
}

export function createSearxngProvider(opts: {
  instanceUrl: string;
  fetchImpl?: typeof fetch;
}): KeylessProvider {
  const base = normaliseInstanceUrl(opts.instanceUrl);
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    id: "searxng",
    label: "SearXNG",
    async lookup({ query, domain, country, language }): Promise<SerpLookup> {
      if (!base) {
        return { ok: false, failure: { engine: "searxng", code: "badConfig" } };
      }

      const params = new URLSearchParams({ q: query, format: "json" });
      const locale = searxLanguage(language, country);
      if (locale) params.set("language", locale);

      let res: Response;
      try {
        res = await doFetch(`${base}/search?${params}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        return {
          ok: false,
          failure: { engine: "searxng", code: "network", detail: `${base}: ${(err as Error).message}` },
        };
      }

      if (res.status === 429) {
        return { ok: false, failure: { engine: "searxng", code: "rateLimited" } };
      }

      const text = await res.text().catch(() => "");
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        // A stock instance answers a JSON request with 403 and an HTML
        // page; some answer 200 with HTML. Either way the fix is the same
        // line in settings.yml, and the message has to name it.
        if (res.ok || res.status === 403) {
          return { ok: false, failure: { engine: "searxng", code: "jsonDisabled" } };
        }
        return { ok: false, failure: { engine: "searxng", code: "http", status: res.status } };
      }
      if (!res.ok) {
        return { ok: false, failure: { engine: "searxng", code: "http", status: res.status } };
      }

      const { urls, engines } = parseSearxResults(body);
      if (urls.length === 0) {
        // Every engine blocked or disabled. No answer, not "not ranking".
        const down = unresponsiveEngines(body);
        return {
          ok: false,
          failure: {
            engine: "searxng",
            code: "noResults",
            ...(down.length > 0 ? { detail: down.join(", ") } : {}),
          },
        };
      }

      const hit = positionOf(urls, domain);
      return {
        ok: true,
        position: hit?.position ?? null,
        url: hit?.url ?? null,
        resultsScanned: urls.length,
        // Provenance: which engines actually answered. Two SearXNG
        // readings are only comparable if the same engines backed them.
        engine: engines.length > 0 ? engines.join(", ") : "searxng",
      };
    },
  };
}
