/**
 * Auto-suggest competitors from a client's tracked keywords. For the
 * top 5 keywords (by source priority), run a free DuckDuckGo search,
 * count which non-client domains keep appearing in the top-10. The
 * most frequent ones are likely the client's actual SERP competitors.
 *
 * Limits: only inserts new competitor rows (skip duplicates), maximum
 * of 5 suggestions per call, and only run when the client has zero
 * competitors already.
 */

import { count, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, competitors, keywords } from "@/db/schema";
import { searchDuckDuckGo } from "./link-prospector";
import { logActivity } from "./activity";

export async function suggestCompetitorsFromKeywords(opts: {
  clientId: number;
  /** Force-add even if competitor list isn't empty. */
  force?: boolean;
}): Promise<{ added: number }> {
  const [c] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, opts.clientId))
    .limit(1);
  if (!c) return { added: 0 };

  if (!opts.force) {
    const [existing] = await db
      .select({ value: count() })
      .from(competitors)
      .where(eq(competitors.clientId, opts.clientId));
    if ((existing?.value ?? 0) > 0) return { added: 0 };
  }

  let myDomain = "";
  try {
    myDomain = new URL(
      /^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return { added: 0 };
  }

  const seedKeywords = await db
    .select({ q: keywords.query })
    .from(keywords)
    .where(eq(keywords.clientId, opts.clientId))
    .orderBy(desc(keywords.createdAt))
    .limit(5);
  if (seedKeywords.length === 0) return { added: 0 };

  const domainScore = new Map<string, { count: number; sample: string }>();

  for (const kw of seedKeywords) {
    try {
      const results = await searchDuckDuckGo(kw.q);
      for (const r of results.slice(0, 10)) {
        let d: string;
        try {
          d = new URL(r.url).hostname.replace(/^www\./, "").toLowerCase();
        } catch {
          continue;
        }
        if (!d || d === myDomain) continue;
        if (isJunkDomain(d)) continue;
        const cur = domainScore.get(d);
        if (cur) {
          cur.count++;
        } else {
          domainScore.set(d, { count: 1, sample: r.title || d });
        }
      }
    } catch {
      continue;
    }
  }

  const ranked = Array.from(domainScore.entries())
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  if (ranked.length === 0) return { added: 0 };

  for (const [domain, meta] of ranked) {
    await db.insert(competitors).values({
      clientId: opts.clientId,
      name: meta.sample.slice(0, 80) || domain,
      url: `https://${domain}`,
      notes: `Auto-suggested from SERP overlap (${meta.count} of ${seedKeywords.length} seed keywords).`,
    });
  }

  await logActivity({
    kind: "client.created",
    message: `Auto-suggested ${ranked.length} competitor${ranked.length === 1 ? "" : "s"} from SERP overlap.`,
    clientId: opts.clientId,
    entityType: "competitor",
  });

  return { added: ranked.length };
}

const JUNK_DOMAINS = new Set([
  "wikipedia.org",
  "youtube.com",
  "reddit.com",
  "quora.com",
  "amazon.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "instagram.com",
  "pinterest.com",
  "tiktok.com",
  "medium.com",
  "github.com",
  "duckduckgo.com",
  "google.com",
  "bing.com",
  "yelp.com",
]);

function isJunkDomain(d: string): boolean {
  if (JUNK_DOMAINS.has(d)) return true;
  if (/\.(gov|edu|mil)$/i.test(d)) return true;
  if (d.endsWith(".wikipedia.org")) return true;
  return false;
}
