/**
 * Which keyless rank sources this install has configured, in the order
 * they should be tried.
 *
 * SearXNG first: free, no quota, and (self-hosted) it answers from the
 * engines you chose. Brave second: its free tier has a monthly cap worth
 * conserving, and its index is not Google's.
 *
 * Both sit after Search Console and before the paid API and the browser
 * (rank-resolve.ts).
 */

import { decrypt } from "../crypto";
import { getSetting } from "../settings-store";
import { createBraveProvider } from "./brave";
import { createSearxngProvider } from "./searxng";
import type { KeylessProvider } from "./types";

export type { KeylessProvider, SerpLookup, SerpQuery } from "./types";
export { positionOf, urlMatchesDomain } from "./match";
export {
  RANK_SOURCES,
  RANK_SOURCE_IDS,
  isRankSource,
  rankProvenance,
  type RankSource,
} from "./sources";

/** The SearXNG address: the setting, else SEARXNG_URL (set by docker-compose). */
export async function getSearxngUrl(): Promise<{ url: string; from: "settings" | "env" } | null> {
  const fromDb = await getSetting<string>("serp.searxng_url");
  if (fromDb && fromDb.trim()) return { url: fromDb.trim(), from: "settings" };
  const env = process.env.SEARXNG_URL;
  return env && env.trim() ? { url: env.trim(), from: "env" } : null;
}

/** The Brave key: the setting (encrypted at rest), else BRAVE_SEARCH_API_KEY. */
export async function getBraveApiKey(): Promise<string | null> {
  const stored = await getSetting<string>("serp.brave_key");
  if (stored && stored.trim()) {
    const plain = decrypt(stored);
    if (plain && plain.trim()) return plain.trim();
  }
  const env = process.env.BRAVE_SEARCH_API_KEY;
  return env && env.trim() ? env.trim() : null;
}

/**
 * The configured providers, best first. Empty when none is set up,
 * which is the default and must stay a supported state.
 */
export async function configuredKeylessProviders(): Promise<KeylessProvider[]> {
  const out: KeylessProvider[] = [];
  const searx = await getSearxngUrl();
  if (searx) out.push(createSearxngProvider({ instanceUrl: searx.url }));
  const brave = await getBraveApiKey();
  if (brave) out.push(createBraveProvider({ apiKey: brave }));
  return out;
}
