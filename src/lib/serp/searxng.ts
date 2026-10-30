/**
 * SearXNG as a rank source.
 *
 * SearXNG is an open-source metasearch engine: it queries Google, Bing,
 * Brave, Qwant and others server-side and merges the results. Pointing
 * this tool at one you run yourself gives ranked results with no API
 * key and no browser — which is the combination nothing else offers.
 *
 * Why it is worth having, measured rather than assumed. On 30 Oct 2026,
 * from this machine, a plain HTTP request got:
 *
 *   Google      -> a JS interstitial, no results
 *   DuckDuckGo  -> a CAPTCHA ("select all squares containing a duck")
 *   Bing        -> a page shell with no result links
 *   Startpage   -> a shell
 *
 * So the browser path is not merely slow, it is frequently blocked
 * outright, and the thing it falls back to is also blocked. A SearXNG
 * instance queries several engines and returns whatever answered, which
 * degrades instead of failing.
 *
 * SELF-HOSTED IS THE POINT. Public instances rate-limit hard — six were
 * tried the same day and every one either disabled `format=json` or
 * returned 429 — and borrowing somebody's instance for automated
 * queries is using a volunteer's quota. The setting takes a URL so you
 * can point it at your own; the UI says so.
 *
 * `format=json` is OFF by default in SearXNG. On your own instance add
 * it to settings.yml:
 *
 *     search:
 *       formats:
 *         - html
 *         - json
 */

import { positionOf } from "./match";
import type { SerpLookup, SerpProvider } from "./types";

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
 * Exported for tests, because this is the part that silently changes
 * when SearXNG does — the standing rule for anything that parses a
 * third party's response.
 *
 * SearXNG merges duplicate URLs across engines, but the same page can
 * still appear twice with different query strings, so dedupe on the
 * URL's identity rather than its exact string. Order is whatever the
 * instance returned; its merge algorithm is the ranking.
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

export function createSearxngProvider(opts: {
  instanceUrl: string;
  fetchImpl?: typeof fetch;
}): SerpProvider {
  const base = normaliseInstanceUrl(opts.instanceUrl);
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    id: "searxng",
    label: "SearXNG",
    async lookup({ query, domain, country, language }): Promise<SerpLookup> {
      if (!base) {
        return {
          ok: false,
          error:
            "The SearXNG address isn't a valid URL. It should look like https://searx.example.com.",
        };
      }

      const params = new URLSearchParams({ q: query, format: "json" });
      // SearXNG takes a single locale tag. Country alone is not one.
      if (language) {
        params.set("language", country ? `${language}-${country.toUpperCase()}` : language);
      }

      let res: Response;
      try {
        res = await doFetch(`${base}/search?${params}`, {
          headers: { accept: "application/json" },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        return {
          ok: false,
          error: `Couldn't reach the SearXNG instance at ${base}: ${
            (err as Error).message
          }`,
        };
      }

      if (res.status === 429) {
        return {
          ok: false,
          error:
            "The SearXNG instance rate-limited us. Public instances do this quickly — point this at one you run yourself.",
        };
      }
      if (!res.ok) {
        return { ok: false, error: `SearXNG returned HTTP ${res.status}.` };
      }

      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        // The overwhelmingly common misconfiguration, and the error
        // message has to name the fix or nobody will find it.
        return {
          ok: false,
          error:
            "The SearXNG instance answered with HTML, not JSON. Add `json` under `search.formats` in its settings.yml and restart it — JSON is off by default.",
        };
      }

      const { urls, engines } = parseSearxResults(body);
      if (urls.length === 0) {
        return {
          ok: false,
          error:
            "SearXNG returned no results at all, which usually means every engine it tried was blocked or disabled.",
        };
      }

      const hit = positionOf(urls, domain);
      return {
        ok: true,
        position: hit?.position ?? null,
        url: hit?.url ?? null,
        resultsScanned: urls.length,
        // Provenance: which engines actually answered. Two SearXNG
        // readings are only comparable if the same engines backed them,
        // and a user staring at a 10-place move deserves to see that
        // Google dropped out of the mix.
        detail: engines.length > 0 ? `via ${engines.join(", ")}` : undefined,
      };
    },
  };
}
