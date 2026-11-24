/**
 * Brave Search API as a rank source.
 *
 * An official API with a free tier, behind a key — so it is an option,
 * never a requirement: the tool works without it.
 *
 * It queries Brave's own independent index — not Google's. A page can
 * sit at #3 on Brave and #30 on Google, so a Brave reading is recorded
 * as a Brave reading, and `comparePositions` refuses to subtract it from
 * a Search Console average or a Google check.
 *
 * Ported from the upstream project (src/lib/serp/brave.ts); failures are
 * codes so the interface can word them.
 */

import { languageCode } from "./locale";
import { positionOf } from "./match";
import type { KeylessProvider, SerpLookup } from "./types";

const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";
const TIMEOUT_MS = 20_000;
/** The API's own cap per request. */
const MAX_COUNT = 20;

type BraveWebResult = { url?: unknown };

/** Ordered, deduplicated result URLs from a Brave response. */
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
}): KeylessProvider {
  const doFetch = opts.fetchImpl ?? fetch;

  return {
    id: "brave",
    label: "Brave Search",
    async lookup({ query, domain, country, language }): Promise<SerpLookup> {
      if (!opts.apiKey.trim()) {
        return { ok: false, failure: { engine: "brave", code: "badConfig" } };
      }

      const params = new URLSearchParams({ q: query, count: String(MAX_COUNT) });
      if (country) params.set("country", country.toUpperCase());
      const lang = languageCode(language);
      if (lang) params.set("search_lang", lang);

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
          failure: { engine: "brave", code: "network", detail: (err as Error).message },
        };
      }

      // Each needs its own message: "it didn't work" sends somebody to
      // check the wrong thing.
      if (res.status === 401 || res.status === 403) {
        return { ok: false, failure: { engine: "brave", code: "badKey" } };
      }
      if (res.status === 429) {
        return { ok: false, failure: { engine: "brave", code: "rateLimited" } };
      }
      if (!res.ok) {
        return { ok: false, failure: { engine: "brave", code: "http", status: res.status } };
      }

      let body: unknown;
      try {
        body = JSON.parse(await res.text());
      } catch {
        return { ok: false, failure: { engine: "brave", code: "unreadable" } };
      }

      const urls = parseBraveResults(body);
      if (urls.length === 0) {
        // An empty web section is not "position 21+". It is no answer.
        return { ok: false, failure: { engine: "brave", code: "noResults" } };
      }

      const hit = positionOf(urls, domain);
      return {
        ok: true,
        position: hit?.position ?? null,
        url: hit?.url ?? null,
        resultsScanned: urls.length,
        engine: "brave",
      };
    },
  };
}
