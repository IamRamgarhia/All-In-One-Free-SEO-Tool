/**
 * Is a hit really from the crawler its user agent names?
 *
 * Anyone can put "Googlebot" in a user agent, and scrapers do, because
 * sites let Googlebot through. A log analyzer that counts user agents
 * reports whatever the scrapers claimed. The crawlers' owners publish
 * the address ranges they crawl from, so a hit is verified when its
 * address is inside its owner's list.
 *
 * The idea comes from advertools (MIT), which verifies crawlers by
 * reverse DNS. Published ranges are used here instead: no DNS lookup per
 * address, and several AI crawlers publish ranges without a reverse DNS
 * convention to check.
 */

import { BlockList, isIP } from "node:net";

const ANTHROPIC = "https://claude.com/crawling/bots.json";

/**
 * Address lists each crawler's owner publishes. Every URL was fetched
 * and parsed in September 2026. A crawler missing from here is counted
 * by user agent only, and the page says so.
 */
export const CRAWLER_IP_SOURCES: Readonly<Record<string, readonly string[]>> = {
  // Google lists Googlebot under its "common crawlers".
  Googlebot: ["https://developers.google.com/static/crawling/ipranges/common-crawlers.json"],
  Bingbot: ["https://www.bing.com/toolbox/bingbot.json"],
  GPTBot: ["https://openai.com/gptbot.json"],
  "OAI-SearchBot": ["https://openai.com/searchbot.json"],
  "ChatGPT-User": ["https://openai.com/chatgpt-user.json"],
  // One list for all three: Anthropic's crawler page says a source
  // address "on this list" means the crawler is Anthropic's.
  ClaudeBot: [ANTHROPIC],
  "Claude-User": [ANTHROPIC],
  "Claude-SearchBot": [ANTHROPIC],
  PerplexityBot: ["https://www.perplexity.com/perplexitybot.json"],
  "Perplexity-User": ["https://www.perplexity.com/perplexity-user.json"],
  Applebot: ["https://search.developer.apple.com/applebot.json"],
  DuckDuckBot: ["https://duckduckgo.com/duckduckbot.json"],
  CCBot: ["https://index.commoncrawl.org/ccbot.json"],
};

export type CrawlerVerification = {
  /** Hits from an address inside the owner's published ranges. */
  verified: number;
  /** Hits from an address outside them. */
  unverified: number;
  /** Hits whose log line had no address we could read. */
  noAddress: number;
  /** Set when the owner's list could not be loaded; the counts are then zero. */
  listError?: string;
};

/**
 * Build one matcher from one or more published lists, which share the
 * shape `{ prefixes: [{ ipv4Prefix } | { ipv6Prefix }] }`. Throws on
 * anything else, so a changed format fails the check instead of
 * verifying nothing and calling every hit an impostor.
 */
export function rangesFrom(...lists: unknown[]): BlockList {
  const ranges = new BlockList();
  let added = 0;
  for (const json of lists) {
    const prefixes = (json as { prefixes?: unknown } | null)?.prefixes;
    if (!Array.isArray(prefixes)) throw new Error("Not a published IP range list.");
    for (const p of prefixes as Record<string, unknown>[]) {
      const cidr =
        typeof p?.ipv4Prefix === "string"
          ? p.ipv4Prefix
          : typeof p?.ipv6Prefix === "string"
            ? p.ipv6Prefix
            : null;
      if (!cidr) continue;
      const [address, bits] = cidr.split("/");
      const family = isIP(address);
      if (!family || !bits) continue;
      ranges.addSubnet(address, Number(bits), family === 6 ? "ipv6" : "ipv4");
      added++;
    }
  }
  if (added === 0) throw new Error("The published list had no address ranges in it.");
  return ranges;
}

export function inRanges(ranges: BlockList, address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ranges.check(address, "ipv4");
  if (family === 6) return ranges.check(address, "ipv6");
  return false;
}

/**
 * The client address in an access-log line: the first field, or the
 * second when the first is a virtual host (Apache's vhost_combined —
 * advertools calls it common_with_vhost).
 */
export function clientAddressOf(line: string): string | null {
  const fields = line.split(" ", 2);
  for (const field of fields) {
    const candidate = field.replace(/^\[|\]$/g, "");
    if (isIP(candidate)) return candidate;
  }
  return null;
}

/**
 * Count verified and unverified hits for one crawler, from its hits
 * grouped by address (null for lines with none).
 */
export function tally(
  hitsByAddress: ReadonlyMap<string | null, number>,
  ranges: BlockList,
): CrawlerVerification {
  const out: CrawlerVerification = { verified: 0, unverified: 0, noAddress: 0 };
  for (const [address, count] of hitsByAddress) {
    if (address === null) out.noAddress += count;
    else if (inRanges(ranges, address)) out.verified += count;
    else out.unverified += count;
  }
  return out;
}

/**
 * When not one hit from a verifiable crawler came from its published
 * ranges, the likelier story is a log that records a CDN or proxy
 * address rather than a site visited only by impostors. Says so, or
 * returns null.
 */
export function proxyAddressWarning(
  results: Readonly<Record<string, CrawlerVerification>>,
  minHits = 20,
): string | null {
  const checked = Object.values(results).filter((r) => !r.listError);
  const withAddress = checked.reduce((s, r) => s + r.verified + r.unverified, 0);
  const verified = checked.reduce((s, r) => s + r.verified, 0);
  if (withAddress < minHits || verified > 0) return null;
  return (
    `None of the ${withAddress.toLocaleString()} hits from crawlers that publish their addresses came from those addresses. ` +
    "That usually means this log records a CDN or proxy address instead of the visitor's, so real crawlers and impostors look the same here. " +
    "Log the original client address (behind Cloudflare, the CF-Connecting-IP header) and upload again."
  );
}

const DAY_MS = 86_400_000;
/** Keyed by the list URLs, so crawlers that share a list fetch it once. */
const cache = new Map<string, { at: number; ranges: Promise<BlockList> }>();

/** A crawler's published ranges, fetched at most once a day per process. */
export async function loadRanges(crawler: string): Promise<BlockList> {
  const urls = CRAWLER_IP_SOURCES[crawler];
  if (!urls) throw new Error(`${crawler} does not publish an address list.`);
  const key = urls.join(" ");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.ranges;

  const ranges = Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${res.status}.`);
      return res.json();
    }),
  ).then((lists) => rangesFrom(...lists));
  cache.set(key, { at: Date.now(), ranges });
  // A failed fetch must not be served from the cache for a day.
  ranges.catch(() => cache.delete(key));
  return ranges;
}
