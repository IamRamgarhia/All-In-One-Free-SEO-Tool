/**
 * Brand monitoring across free public sources:
 *
 *   - Reddit (search.json)
 *   - HackerNews (Algolia search)
 *   - Bluesky public timeline (search.posts)
 *   - Mastodon (per-instance public timeline search; we use mastodon.social
 *     by default but the user can configure their own instance)
 *
 * All endpoints are free, unauthenticated, and rate-limit friendly.
 *
 * For each match we extract a stable external_id, title, excerpt, author,
 * URL, and a heuristic sentiment in {-1, 0, +1}. The schedule runner can
 * call `monitorAllClients()` daily; the per-client UI button calls
 * `monitorBrand()` directly.
 */

import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { brandMentions, type NewBrandMention } from "@/db/schema";

const USER_AGENT =
  "Mozilla/5.0 (compatible; seo-tool-brand-monitor/1.0; +https://example.com)";

export type BrandQuery = {
  brandName: string;
  domain: string | null;
};

export type Mention = NewBrandMention;

export async function monitorBrand(opts: {
  clientId: number;
  brandName: string;
  domain?: string | null;
}): Promise<{ added: number; total: number; errors: string[] }> {
  const errors: string[] = [];
  const collected: Mention[] = [];

  for (const fn of [
    fetchFromReddit,
    fetchFromHackerNews,
    fetchFromBluesky,
    fetchFromMastodon,
  ]) {
    try {
      const rows = await fn({
        brandName: opts.brandName,
        domain: opts.domain ?? null,
      });
      for (const r of rows)
        collected.push({ ...r, clientId: opts.clientId });
    } catch (err) {
      errors.push((err as Error).message?.slice(0, 200) ?? "unknown");
    }
  }

  // Batched dedupe: pull all existing (clientId, source, externalId)
  // tuples in a single query, then filter in memory before insert.
  // Replaces the N+1 (one SELECT per item) with one bulk SELECT.
  let added = 0;
  if (collected.length > 0) {
    const externalIds = collected.map((m) => m.externalId).filter(Boolean);
    const existing = externalIds.length
      ? await db
          .select({
            clientId: brandMentions.clientId,
            source: brandMentions.source,
            externalId: brandMentions.externalId,
          })
          .from(brandMentions)
          .where(inArray(brandMentions.externalId, externalIds))
      : [];
    const seen = new Set(
      existing.map((e) => `${e.clientId}::${e.source}::${e.externalId}`),
    );
    const toInsert = collected.filter(
      (m) => !seen.has(`${m.clientId}::${m.source}::${m.externalId}`),
    );
    if (toInsert.length > 0) {
      await db.insert(brandMentions).values(toInsert);
      added = toInsert.length;
    }
  }

  return { added, total: collected.length, errors };
}

/**
 * Cycle through every client and run brand monitoring. Cheap because
 * each source is one HTTP call per client.
 */
export async function monitorAllClients(): Promise<{
  clients: number;
  added: number;
}> {
  const { clients } = await import("@/db/schema");
  const all = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
    })
    .from(clients);
  let totalAdded = 0;
  for (const c of all) {
    let domain: string | null = null;
    try {
      domain = new URL(/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`)
        .hostname.replace(/^www\./, "");
    } catch {
      domain = null;
    }
    try {
      const r = await monitorBrand({
        clientId: c.id,
        brandName: c.name,
        domain,
      });
      totalAdded += r.added;
    } catch {
      continue;
    }
  }
  return { clients: all.length, added: totalAdded };
}

// ============== Source fetchers ==============

type SourceArgs = {
  brandName: string;
  domain: string | null;
};

async function fetchFromReddit(args: SourceArgs): Promise<Mention[]> {
  const out: Mention[] = [];
  const queries = [args.brandName];
  if (args.domain) queries.push(args.domain);

  for (const q of queries) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(`"${q}"`)}&limit=25&sort=new`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        data?: {
          children?: Array<{
            data?: {
              id?: string;
              title?: string;
              selftext?: string;
              author?: string;
              permalink?: string;
              created_utc?: number;
              subreddit?: string;
              url?: string;
            };
          }>;
        };
      };
      for (const c of data.data?.children ?? []) {
        const d = c.data;
        if (!d?.id || !d.title) continue;
        const link = d.permalink ? `https://www.reddit.com${d.permalink}` : d.url ?? "";
        const linksToClient = Boolean(
          args.domain &&
            ((d.url && d.url.includes(args.domain)) ||
              (d.selftext && d.selftext.includes(args.domain))),
        );
        out.push({
          source: "reddit",
          externalId: d.id,
          url: link,
          author: d.author ?? null,
          title: `r/${d.subreddit ?? "?"}: ${d.title.slice(0, 200)}`,
          excerpt: (d.selftext ?? "").slice(0, 280) || null,
          sentiment: heuristicSentiment(`${d.title} ${d.selftext ?? ""}`),
          linksToClient,
          publishedAt: d.created_utc ? new Date(d.created_utc * 1000) : null,
          clientId: 0, // overridden by caller
        });
      }
    } catch {
      // skip
    } finally {
      clearTimeout(t);
    }
  }

  return out;
}

async function fetchFromHackerNews(args: SourceArgs): Promise<Mention[]> {
  const out: Mention[] = [];
  const queries = [args.brandName];
  if (args.domain) queries.push(args.domain);

  for (const q of queries) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=(story,comment)&hitsPerPage=20`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        hits?: Array<{
          objectID?: string;
          title?: string;
          comment_text?: string;
          story_text?: string;
          author?: string;
          url?: string;
          created_at?: string;
        }>;
      };
      for (const h of data.hits ?? []) {
        if (!h.objectID) continue;
        const titleOrComment =
          h.title ?? (h.comment_text ?? "").slice(0, 200) ?? "(no title)";
        const text = `${h.title ?? ""} ${h.story_text ?? ""} ${h.comment_text ?? ""}`;
        const link = h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`;
        const linksToClient = Boolean(
          args.domain && (h.url ?? text).includes(args.domain),
        );
        out.push({
          source: "hackernews",
          externalId: h.objectID,
          url: link,
          author: h.author ?? null,
          title: titleOrComment.slice(0, 200),
          excerpt: (h.comment_text ?? h.story_text ?? "").slice(0, 280) || null,
          sentiment: heuristicSentiment(text),
          linksToClient,
          publishedAt: h.created_at ? new Date(h.created_at) : null,
          clientId: 0,
        });
      }
    } catch {
      // skip
    } finally {
      clearTimeout(t);
    }
  }

  return out;
}

async function fetchFromBluesky(args: SourceArgs): Promise<Mention[]> {
  const out: Mention[] = [];
  const queries = [args.brandName];
  if (args.domain) queries.push(args.domain);

  for (const q of queries) {
    const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(q)}&limit=25`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        posts?: Array<{
          uri?: string;
          author?: { handle?: string; displayName?: string };
          record?: { text?: string; createdAt?: string };
        }>;
      };
      for (const p of data.posts ?? []) {
        if (!p.uri) continue;
        const text = p.record?.text ?? "";
        const linksToClient = Boolean(args.domain && text.includes(args.domain));
        // Convert at://did:plc:.../app.bsky.feed.post/<rkey> → bsky.app URL
        const handle = p.author?.handle ?? "";
        const rkey = p.uri.split("/").pop() ?? "";
        const webUrl = handle && rkey
          ? `https://bsky.app/profile/${handle}/post/${rkey}`
          : p.uri;
        out.push({
          source: "bluesky",
          externalId: p.uri,
          url: webUrl,
          author:
            p.author?.displayName ?? p.author?.handle ?? null,
          title: text.slice(0, 120) || "(post)",
          excerpt: text.slice(0, 280) || null,
          sentiment: heuristicSentiment(text),
          linksToClient,
          publishedAt: p.record?.createdAt
            ? new Date(p.record.createdAt)
            : null,
          clientId: 0,
        });
      }
    } catch {
      // skip
    } finally {
      clearTimeout(t);
    }
  }

  return out;
}

async function fetchFromMastodon(args: SourceArgs): Promise<Mention[]> {
  const out: Mention[] = [];
  const queries = [args.brandName];
  if (args.domain) queries.push(args.domain);

  // Default instance — most public servers index broadly via search.
  const instance = "mastodon.social";

  for (const q of queries) {
    const url = `https://${instance}/api/v2/search?q=${encodeURIComponent(q)}&type=statuses&limit=20`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8_000);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as {
        statuses?: Array<{
          id?: string;
          content?: string;
          url?: string;
          account?: { username?: string; display_name?: string };
          created_at?: string;
        }>;
      };
      for (const s of data.statuses ?? []) {
        if (!s.id) continue;
        const text = stripHtml(s.content ?? "");
        const linksToClient = Boolean(args.domain && text.includes(args.domain));
        out.push({
          source: "mastodon",
          externalId: `${instance}-${s.id}`,
          url: s.url ?? "",
          author:
            s.account?.display_name ?? s.account?.username ?? null,
          title: text.slice(0, 120) || "(post)",
          excerpt: text.slice(0, 280) || null,
          sentiment: heuristicSentiment(text),
          linksToClient,
          publishedAt: s.created_at ? new Date(s.created_at) : null,
          clientId: 0,
        });
      }
    } catch {
      // skip
    } finally {
      clearTimeout(t);
    }
  }

  return out;
}

// ============== Helpers ==============

const POSITIVE_WORDS = [
  "love",
  "great",
  "awesome",
  "amazing",
  "excellent",
  "best",
  "fantastic",
  "recommend",
  "perfect",
  "thank",
  "thanks",
  "wonderful",
  "useful",
  "helpful",
  "saved",
  "lifesaver",
];
const NEGATIVE_WORDS = [
  "bad",
  "worst",
  "terrible",
  "awful",
  "hate",
  "broken",
  "scam",
  "useless",
  "garbage",
  "annoying",
  "frustrating",
  "bug",
  "buggy",
  "slow",
  "unreliable",
  "disappointed",
  "avoid",
];

function heuristicSentiment(text: string): number {
  const lower = text.toLowerCase();
  let pos = 0;
  let neg = 0;
  for (const w of POSITIVE_WORDS) {
    if (lower.includes(w)) pos++;
  }
  for (const w of NEGATIVE_WORDS) {
    if (lower.includes(w)) neg++;
  }
  if (pos > neg) return 1;
  if (neg > pos) return -1;
  return 0;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
