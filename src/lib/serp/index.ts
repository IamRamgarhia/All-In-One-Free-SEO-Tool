/**
 * Which keyless rank sources this install has configured, in the order
 * they should be tried.
 *
 * The order is not arbitrary. SearXNG first because it is free, has no
 * quota, and (self-hosted) answers from the engines you chose. Brave
 * second because its free tier has a monthly cap worth conserving, and
 * because its index is not Google's, which makes it the less
 * representative answer of the two for most SEO questions.
 *
 * Both sit after Search Console and before the browser. See types.ts
 * for why.
 */

import { getSetting } from "../settings-store";
import { createBraveProvider } from "./brave";
import { createSearxngProvider } from "./searxng";
import type { SerpProvider } from "./types";

export type { SerpLookup, SerpProvider, SerpQuery } from "./types";
export { positionOf, urlMatchesDomain } from "./match";
export {
  RANK_SOURCES,
  RANK_SOURCE_IDS,
  isRankSource,
  rankProvenance,
  rankSourceLabel,
  type RankSource,
} from "./sources";

export async function getSearxngUrl(): Promise<string | null> {
  const fromDb = await getSetting<string>("serp.searxng_url");
  if (fromDb && fromDb.trim()) return fromDb.trim();
  const env = process.env.SEARXNG_URL;
  return env && env.trim() ? env.trim() : null;
}

export async function getBraveApiKey(): Promise<string | null> {
  const fromDb = await getSetting<string>("serp.brave_key");
  if (fromDb && fromDb.trim()) return fromDb.trim();
  const env = process.env.BRAVE_SEARCH_API_KEY;
  return env && env.trim() ? env.trim() : null;
}

/**
 * The configured providers, best first. Empty when none is set up,
 * which is the default and must stay a supported state — the tool works
 * without any of this.
 */
export async function configuredSerpProviders(): Promise<SerpProvider[]> {
  const out: SerpProvider[] = [];
  const searx = await getSearxngUrl();
  if (searx) out.push(createSearxngProvider({ instanceUrl: searx }));
  const brave = await getBraveApiKey();
  if (brave) out.push(createBraveProvider({ apiKey: brave }));
  return out;
}
