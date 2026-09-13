/**
 * Suggest a client's competitors from who ranks for what the client sells.
 *
 * Runs a handful of free DuckDuckGo searches and keeps the domains that
 * turn up across several of them.
 *
 * WHAT WAS WRONG, ON REAL CLIENTS
 *
 * Every competitor this had ever suggested, across the whole install,
 * was wrong. Ten out of ten.
 *
 *   - A tape manufacturer in Delhi got Walmart, Home Depot, Target,
 *     Staples and Lowe's. The searches carried no region, so DuckDuckGo
 *     answered for the US. They were seeded on tracked keywords that all
 *     ended in "near me". And retailers were never excluded, although a
 *     retailer is where a manufacturer's product is sold, not who it
 *     competes with.
 *
 *   - A web agency got five coupon sites, because its tracked keywords
 *     contained its own brand name.
 *
 *   - Each was named after a search result's page title, so the list
 *     read "Magnetic Adhesive Strips for Office Use - Walmart.com".
 *
 *   - The note said "8 of 5 seed keywords". The count rose once per
 *     result row, so a domain listed twice in one search counted twice
 *     and the figure could exceed the number of searches. An impossible
 *     number, stated as evidence.
 *
 * Verified live before this rewrite: "bopp packaging tapes manufacturer"
 * with no region returned tape makers in the US and China; with
 * kl=in-en it returned Indian tape manufacturers, plus IndiaMART and
 * ExportersIndia, which are directories and are excluded here.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, competitors, keywords } from "@/db/schema";
import { duckDuckGoRegion, searchDuckDuckGo } from "./link-prospector";
import { logActivity } from "./activity";
import { getClientContext } from "./client-knowledge";
import { looksB2B } from "./product-list";
import { brandFilterFor, SEED_CONFIDENCE_FLOOR } from "./site-vocabulary";

export type SerpResult = { url: string; title: string };

export type RankedCompetitor = {
  domain: string;
  /** How many of the searches it appeared in. Never more than were run. */
  queries: number;
  /** Which searches, so the note can say. */
  matched: string[];
  /** Best position it reached in any of them, 1-based. */
  bestPosition: number;
};

/**
 * Domains that rank without being anybody's competitor.
 *
 * Marketplaces and retailers are where a product is sold. Directories,
 * review sites and freelance platforms list businesses rather than being
 * one. Coupon sites fill the results for anything with a brand-like name.
 * Matched as a registrable domain, so dir.indiamart.com is caught by
 * indiamart.com.
 */
const NOT_COMPETITORS = [
  // Reference and social
  "wikipedia.org", "youtube.com", "reddit.com", "quora.com", "facebook.com",
  "twitter.com", "x.com", "linkedin.com", "instagram.com", "pinterest.com",
  "tiktok.com", "medium.com", "github.com", "duckduckgo.com", "google.com",
  "bing.com", "yelp.com",
  // Retailers and marketplaces
  "walmart.com", "target.com", "homedepot.com", "lowes.com", "staples.com",
  "bestbuy.com", "costco.com", "ebay.com", "etsy.com", "flipkart.com",
  "alibaba.com", "aliexpress.com", "made-in-china.com", "1688.com",
  "globalsources.com", "indiamart.com", "tradeindia.com", "exportersindia.com",
  "justdial.com", "sulekha.com", "meesho.com", "snapdeal.com", "jiomart.com",
  "blinkit.com", "thomasnet.com",
  // Directories, reviews, freelance platforms
  "yellowpages.com", "clutch.co", "goodfirms.co", "designrush.com",
  "upwork.com", "fiverr.com", "trustpilot.com", "g2.com", "capterra.com",
  "crunchbase.com", "bbb.org", "glassdoor.com", "indeed.com",
  // Coupon aggregators — the five a real agency was given
  "simplycodes.com", "hotdeals.com", "coupert.com", "couponannie.com",
  "dealrated.com", "retailmenot.com", "groupon.com", "slickdeals.net",
  "knoji.com", "dealspotr.com",
  // Learning platforms — found on the rebuilt suggester's first live run
  // for a web agency. Tutorials and courses rank for "mobile app
  // development", and none of them competes for a client's project.
  "geeksforgeeks.org", "coursera.org", "udemy.com", "edx.org",
  "w3schools.com", "tutorialspoint.com", "javatpoint.com",
  "freecodecamp.org", "simplilearn.com", "upgrad.com", "skillshare.com",
  "khanacademy.org",
];

function normaliseDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^www\./, "");
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return normaliseDomain(u.hostname) || null;
  } catch {
    return null;
  }
}

/** Same site, allowing for subdomains in either direction. */
function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export function isNotACompetitor(domain: string): boolean {
  const d = normaliseDomain(domain);
  if (NOT_COMPETITORS.some((base) => d === base || d.endsWith(`.${base}`))) return true;
  // Amazon under every country TLD: amazon.in, amazon.co.uk, amazon.de.
  if (/(^|\.)amazon\.[a-z.]+$/.test(d)) return true;
  if (/\.(gov|edu|mil)(\.[a-z]{2})?$/.test(d)) return true;
  // Deliberately narrow. "deal" alone would also catch idealtapes.com.
  if (/coupon|voucher|promocode/.test(d)) return true;
  return false;
}

/**
 * Which domains keep turning up across a set of searches.
 *
 * Pure, so the counting can be tested without a network. A domain counts
 * once per search however many times it appears in that search's
 * results, which is what makes "8 of 5" impossible.
 */
export function rankCompetitorDomains(opts: {
  searches: readonly { query: string; results: readonly SerpResult[] }[];
  myDomain: string;
  /** Domains already on the client's list. */
  exclude?: ReadonlySet<string>;
  limit?: number;
}): RankedCompetitor[] {
  const mine = normaliseDomain(opts.myDomain);
  const excluded = [...(opts.exclude ?? [])].map(normaliseDomain);
  const byDomain = new Map<string, { queries: Set<string>; best: number }>();

  for (const s of opts.searches) {
    s.results.slice(0, 10).forEach((r, i) => {
      const d = domainOf(r.url);
      if (!d || sameSite(d, mine) || isNotACompetitor(d)) return;
      if (excluded.some((x) => sameSite(d, x))) return;
      const entry = byDomain.get(d) ?? { queries: new Set<string>(), best: Infinity };
      entry.queries.add(s.query);
      entry.best = Math.min(entry.best, i + 1);
      byDomain.set(d, entry);
    });
  }

  // Appearing in one search is ranking for one phrase. Two is the least
  // that says "competes with this business" rather than "shares a word".
  const minQueries = Math.min(2, opts.searches.length);

  return [...byDomain.entries()]
    .map(([domain, e]) => ({
      domain,
      queries: e.queries.size,
      matched: [...e.queries],
      bestPosition: e.best,
    }))
    .filter((c) => c.queries >= minQueries)
    .sort(
      (a, b) =>
        b.queries - a.queries ||
        a.bestPosition - b.bestPosition ||
        a.domain.localeCompare(b.domain),
    )
    .slice(0, opts.limit ?? 5);
}

/** Retail and local modifiers that point a search at shops, not rivals. */
const RETAIL_MODIFIERS =
  /\b(near me|nearby|shops?|stores?|buy|prices?|cheap|online|best|top)\b/gi;

/**
 * A search phrase fit for finding competitors, or null.
 *
 * Refuses anything carrying the client's own distinctive name — seeding
 * on the brand is how an agency's competitors became coupon sites.
 */
export function cleanSeed(
  query: string,
  distinctive: ReadonlySet<string>,
): string | null {
  const words = query
    .toLowerCase()
    .replace(RETAIL_MODIFIERS, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.some((w) => distinctive.has(w))) return null;
  const s = words.join(" ").trim();
  return s.length >= 3 ? s : null;
}

/**
 * Turn raw product or service phrases into searches that find rivals —
 * or decline, when no search could.
 *
 * Pure, so the decision is testable. Three kinds of business:
 *
 *   - A trade business gets "manufacturer" added. Its rivals are other
 *     manufacturers, and an unqualified product search returns the shops
 *     that stock them. Live, this is what turned Walmart and Home Depot
 *     into two Indian tape manufacturers.
 *
 *   - A local or service business gets its city added, and with no city
 *     it gets nothing. Its rivals are the firms in its own area. Searched
 *     without a location, a web agency's services returned coupon sites,
 *     then course sites once those were excluded, then Shopify,
 *     BigCommerce, Forbes, Hostinger and IBM. Excluding the next list of
 *     giants would never have ended; the search was the wrong question.
 *
 *   - Anything else is searched as it stands.
 */
export function qualifySeeds(opts: {
  seeds: readonly string[];
  b2b: boolean;
  niche: string | null;
  city: string | null;
}): { seeds: string[] } | { declined: string } {
  if (opts.seeds.length === 0) return { seeds: [] };
  if (opts.b2b) {
    const trade = /\b(manufacturers?|suppliers?|wholesalers?|wholesale|exporters?)\b/;
    return { seeds: opts.seeds.map((s) => (trade.test(s) ? s : `${s} manufacturer`)) };
  }
  if (opts.niche === "local" || opts.niche === "services") {
    const city = (opts.city ?? "").trim().toLowerCase();
    if (!city) {
      return {
        declined:
          "This is a local or service business with no city set. Its competitors are the businesses in its own area, and a search without a location returns national platforms instead. Add the city in the client's settings to get suggestions.",
      };
    }
    return { seeds: opts.seeds.map((s) => (s.includes(city) ? s : `${s} ${city}`)) };
  }
  return { seeds: [...opts.seeds] };
}

/**
 * What to search for, or why nothing should be searched.
 *
 * The site's own words for what it sells come first — they are read off
 * its navigation, titles and Product schema, and they are not polluted
 * the way tracked keywords can be. Tracked keywords are the fallback,
 * cleaned of retail modifiers and the brand name.
 */
async function seedQueriesFor(
  client: typeof clients.$inferSelect,
): Promise<{ seeds: string[] } | { declined: string }> {
  const siteUrl = /^https?:\/\//i.test(client.url) ? client.url : `https://${client.url}`;
  const brand = brandFilterFor(client.name, siteUrl);
  const view = await getClientContext(client.id, { researchLimit: 0 });

  const b2b = looksB2B(
    [client.description, view.site?.selfDescription, view.curated?.businessOverview]
      .filter(Boolean)
      .join(". "),
  );

  const fromSite = (view.site?.products ?? [])
    .filter((p) => p.confidence >= SEED_CONFIDENCE_FLOOR)
    .map((p) => cleanSeed(p.term, brand.distinctive))
    .filter((s): s is string => Boolean(s));

  let raw: string[];
  if (fromSite.length > 0) {
    raw = [...new Set(fromSite)].slice(0, 5);
  } else {
    const tracked = await db
      .select({ q: keywords.query })
      .from(keywords)
      .where(eq(keywords.clientId, client.id))
      .orderBy(desc(keywords.createdAt))
      .limit(25);
    raw = [
      ...new Set(
        tracked
          .map((k) => cleanSeed(k.q, brand.distinctive))
          .filter((s): s is string => Boolean(s)),
      ),
    ].slice(0, 5);
  }

  return qualifySeeds({ seeds: raw, b2b, niche: client.niche, city: client.city });
}

export type SuggestOutcome = {
  added: number;
  seeds: string[];
  searches: number;
  /** What was, or in a dry run would be, added. */
  ranked: RankedCompetitor[];
  region?: string;
  /** Set when the suggester chose not to search at all, and why. */
  declined?: string;
  /**
   * Set when too few searches could run to rank anything — a bot
   * challenge, a block, a page we couldn't read — and why. Not the same
   * as searching and finding no rivals, and must not be shown as that.
   */
  unavailable?: string;
};

export async function suggestCompetitorsFromKeywords(opts: {
  clientId: number;
  /** Run even if the client already has competitors. */
  force?: boolean;
  /**
   * Search and rank, write nothing. Exists so the real code path can be
   * checked against live search results on a real client without
   * touching its competitor list first.
   */
  dryRun?: boolean;
}): Promise<SuggestOutcome> {
  const none: SuggestOutcome = { added: 0, seeds: [], searches: 0, ranked: [] };

  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!c) return none;

  const existing = await db
    .select({ url: competitors.url })
    .from(competitors)
    .where(eq(competitors.clientId, opts.clientId));
  if (!opts.force && !opts.dryRun && existing.length > 0) return none;

  const myDomain = domainOf(c.url);
  if (!myDomain) return none;

  const planned = await seedQueriesFor(c);
  if ("declined" in planned) {
    // Said out loud, not only returned. Onboarding calls this and moves
    // on without reading the result, so a declined client would otherwise
    // show an empty competitor list with no reason anywhere — replacing a
    // wrong answer with a silent one.
    if (!opts.dryRun) {
      await logActivity({
        kind: "client.created",
        message: `Competitor suggestions skipped: ${planned.declined}`,
        clientId: opts.clientId,
        entityType: "competitor",
      });
    }
    return { ...none, declined: planned.declined };
  }
  const seeds = planned.seeds;
  if (seeds.length === 0) return none;

  const region = duckDuckGoRegion(c.country);
  const searches: { query: string; results: SerpResult[] }[] = [];
  const failures: string[] = [];
  for (const query of seeds) {
    try {
      searches.push({ query, results: await searchDuckDuckGo(query, { region }) });
    } catch (err) {
      // One failed search is not a reason to throw away the others.
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }

  // A competitor has to turn up in two searches, so with fewer than two
  // that ran, nothing can qualify. Returned as "no competitors", that
  // tells the user their market is empty when the searches were blocked.
  if (failures.length > 0 && searches.length < 2) {
    const unavailable = `only ${searches.length} of ${seeds.length} searches could run. ${failures[0]}`;
    if (!opts.dryRun) {
      await logActivity({
        kind: "client.created",
        message: `Competitor suggestions could not run: ${unavailable}`,
        clientId: opts.clientId,
        entityType: "competitor",
      });
    }
    return { ...none, seeds, searches: searches.length, region, unavailable };
  }

  const exclude = new Set(
    existing.map((r) => domainOf(r.url)).filter((d): d is string => Boolean(d)),
  );
  const ranked = rankCompetitorDomains({ searches, myDomain, exclude, limit: 5 });
  const outcome = { seeds, searches: searches.length, ranked, region };
  if (ranked.length === 0 || opts.dryRun) return { added: 0, ...outcome };

  for (const r of ranked) {
    const examples = r.matched
      .slice(0, 3)
      .map((m) => `"${m}"`)
      .join(", ");
    await db.insert(competitors).values({
      clientId: opts.clientId,
      // The domain, not a result's page title. We know the domain is
      // true; a page title is one product listing's headline.
      name: r.domain,
      url: `https://${r.domain}`,
      notes:
        `Auto-suggested: ranked in ${r.queries} of ${searches.length} searches ` +
        `(${examples}${r.matched.length > 3 ? ", …" : ""})` +
        (region ? `, region ${region}.` : "."),
    });
  }

  await logActivity({
    kind: "client.created",
    message: `Auto-suggested ${ranked.length} competitor${ranked.length === 1 ? "" : "s"} from ${searches.length} searches.`,
    clientId: opts.clientId,
    entityType: "competitor",
  });

  return { added: ranked.length, ...outcome };
}
