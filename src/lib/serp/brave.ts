/**
 * Brave Search API as a rank source.
 *
 * An official, documented API with a free tier, which makes it the only
 * option here that is not either a browser fighting bot detection or an
 * instance you have to host. It does need a key, so it sits behind the
 * same BYO-key rule as every other paid-or-keyed integration: optional,
 * never required, and the tool works without it.
 *
 * It queries Brave's own independent index — not Google's. That is a
 * genuine difference in what is being measured, not a detail: a page
 * can sit at #3 on Brave and #30 on Google. So a Brave reading is
 * recorded as a Brave reading, and `comparePositions` refuses to
 * subtract it from a Search Console average or a Google scrape. The
 * number is useful as its own series, not as a stand-in for Google.
 */

import { positionOf } from "./match";
import type { SerpLookup, SerpProvider } from "./types";

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 20_000;
/** The API's own cap per request. */
const MAX_COUNT = 20;

type BraveWebResult = { url?: unknown };

/**
 * Ordered result URLs from a Brave response.
 *
 * Exported because it parses a third party's shape, and the standing
 * rule is that anything which does needs a fixture test — these
 * responses change without notice and the failure is silent.
 */
export function parseBraveResults(body: unknown): string[] {
  const web =
    body && typeof body === "object"
      ? (body as { web?: { results?: unknown } }).web
      : undefined;
  const rows = Array.isArray(web?.results) ? (web.results as BraveWebResult[]) : [];

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
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
  }
  return urls;
}

export function createBraveProvider(opts: {
  apiKey: string;
  fetchImpl?: typeof fetch;
}): SerpProvider {
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    id: "brave",
    label: "Brave Search",
    async lookup({ query, domain, country, language }): Promise<SerpLookup> {
      if (!opts.apiKey.trim()) {
        return { ok: false, error: "No Brave Search API key is set." };
      }

      const params = new URLSearchParams({ q: query, count: String(MAX_COUNT) });
      if (country) params.set("country", country.toUpperCase());
      if (language) params.set("search_lang", language);

      let res: Response;
      try {
        res = await doFetch(`${ENDPOINT}?${params}`, {
          headers: {
            accept: "application/json",
            "accept-encoding": "gzip",
            "x-subscription-token": opts.apiKey.trim(),
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        return {
          ok: false,
          error: `Couldn't reach the Brave Search API: ${(err as Error).message}`,
        };
      }

      // Each of these needs its own message. "It didn't work" sends
      // somebody to check the wrong thing — the exact failure mode the
      // AI layer was fixed for.
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error:
            "Brave Search rejected the API key. Check it in Settings, or generate a new one at api.search.brave.com.",
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          error:
            "Brave Search rate-limited us. The free tier allows one request per second and a monthly cap — rank checks will resume on their own.",
        };
      }
      if (!res.ok) {
        return { ok: false, error: `Brave Search returned HTTP ${res.status}.` };
      }

      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        return { ok: false, error: "Brave Search returned a response we couldn't read." };
      }

      const urls = parseBraveResults(body);
      if (urls.length === 0) {
        // An empty web section is not "position 21+". It is no answer.
        return {
          ok: false,
          error: "Brave Search returned no web results for this query.",
        };
      }

      const hit = positionOf(urls, domain);
      return {
        ok: true,
        position: hit?.position ?? null,
        url: hit?.url ?? null,
        resultsScanned: urls.length,
        // Says what was actually searched. Not finding a domain in
        // Brave's top 20 is a much weaker claim than not finding it in
        // Google's top 100, and the number must not pretend otherwise.
        detail: `Brave's own index, top ${urls.length}`,
      };
    },
  };
}
