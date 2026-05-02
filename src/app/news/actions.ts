"use server";

import { eq, desc, and, inArray, lt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { newsFeeds, newsItems } from "@/db/schema";
import { fetchAndParseFeed, discoverFeedUrl } from "@/lib/rss";

const DEFAULT_FEEDS: { url: string; name: string; category: "google" | "industry" | "blog" | "tracker" }[] = [
  // Google's own
  {
    url: "https://developers.google.com/search/blog/feed.xml",
    name: "Google Search Central Blog",
    category: "google",
  },
  {
    url: "https://status.search.google.com/incidents.rss",
    name: "Google Search Status Dashboard",
    category: "tracker",
  },
  // Top industry sources
  {
    url: "https://searchengineland.com/feed",
    name: "Search Engine Land",
    category: "industry",
  },
  {
    url: "https://www.seroundtable.com/atom.xml",
    name: "Search Engine Roundtable",
    category: "industry",
  },
  {
    url: "https://www.searchenginejournal.com/feed/",
    name: "Search Engine Journal",
    category: "industry",
  },
  {
    url: "https://moz.com/blog/feed",
    name: "Moz Blog",
    category: "blog",
  },
  {
    url: "https://ahrefs.com/blog/feed/",
    name: "Ahrefs Blog",
    category: "blog",
  },
  {
    url: "https://backlinko.com/feed",
    name: "Backlinko",
    category: "blog",
  },
];

/**
 * Seed default SEO feeds on first visit. Idempotent — safe to call repeatedly.
 */
export async function seedDefaultFeedsIfEmpty(): Promise<void> {
  const existing = await db.select({ url: newsFeeds.url }).from(newsFeeds).limit(1);
  if (existing.length > 0) return;
  await db.insert(newsFeeds).values(
    DEFAULT_FEEDS.map((f) => ({
      url: f.url,
      name: f.name,
      category: f.category,
      enabled: true,
    })),
  );
}

const addFeedSchema = z.object({
  url: z.string().trim().min(1),
  name: z.string().trim().max(200).optional(),
});

export type AddFeedResult =
  | { ok: true; id: number; resolvedUrl: string; autoDiscovered: boolean }
  | { ok: false; error: string };

export async function addFeed(input: {
  url: string;
  name?: string;
}): Promise<AddFeedResult> {
  const parsed = addFeedSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const raw = parsed.data.url.trim();
  const inputUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  // Step 1: try the URL exactly as provided
  let resolvedUrl = inputUrl;
  let probe = await fetchAndParseFeed(inputUrl);
  let autoDiscovered = false;

  // Step 2: if that fails, try to auto-discover
  if (!probe.ok || probe.items.length === 0) {
    const discovered = await discoverFeedUrl(inputUrl);
    if (discovered) {
      resolvedUrl = discovered;
      probe = await fetchAndParseFeed(discovered);
      autoDiscovered = true;
    }
  }

  if (!probe.ok || probe.items.length === 0) {
    return {
      ok: false,
      error:
        probe.error ??
        "Couldn't find an RSS feed at that URL. Some sites don't expose one — try pasting the RSS feed URL directly.",
    };
  }

  // Use feed's own title as the display name when user didn't provide one
  const displayName =
    (parsed.data.name && parsed.data.name.trim()) ||
    probe.title ||
    new URL(resolvedUrl).hostname;

  try {
    const [row] = await db
      .insert(newsFeeds)
      .values({
        url: resolvedUrl,
        name: displayName,
        category: "custom",
      })
      .returning({ id: newsFeeds.id });
    revalidatePath("/news");
    return { ok: true, id: row.id, resolvedUrl, autoDiscovered };
  } catch {
    return { ok: false, error: "Feed URL already exists." };
  }
}

/**
 * Delete news items older than N days (across all feeds). Used by the
 * cleanup button to keep the items table tidy.
 */
export async function cleanupOldItems(opts: {
  days: number;
}): Promise<{ deleted: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, opts.days));
  // Delete items where capturedAt < cutoff
  const result = await db
    .delete(newsItems)
    .where(lt(newsItems.capturedAt, cutoff))
    .returning({ id: newsItems.id });
  revalidatePath("/news");
  return { deleted: result.length };
}

export async function clearAllItems(): Promise<{ deleted: number }> {
  const result = await db.delete(newsItems).returning({ id: newsItems.id });
  revalidatePath("/news");
  return { deleted: result.length };
}

export async function deleteOneItem(itemId: number): Promise<void> {
  await db.delete(newsItems).where(eq(newsItems.id, itemId));
  revalidatePath("/news");
}

export async function removeFeed(feedId: number): Promise<void> {
  await db.delete(newsFeeds).where(eq(newsFeeds.id, feedId));
  revalidatePath("/news");
}

export async function toggleFeed(feedId: number, enabled: boolean): Promise<void> {
  await db
    .update(newsFeeds)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(newsFeeds.id, feedId));
  revalidatePath("/news");
}

/**
 * Fetch every enabled feed, parse, dedupe by guid, insert new items.
 * Returns a summary so the UI can show a toast.
 */
export type RefreshResult = {
  feedsChecked: number;
  feedsFailed: number;
  itemsAdded: number;
  errors: { feed: string; error: string }[];
};

export async function refreshFeeds(): Promise<RefreshResult> {
  const feeds = await db
    .select()
    .from(newsFeeds)
    .where(eq(newsFeeds.enabled, true));

  let itemsAdded = 0;
  let feedsFailed = 0;
  const errors: { feed: string; error: string }[] = [];

  // Concurrency-limited (3 in flight) to be polite to publishers
  const queue = [...feeds];
  async function worker() {
    while (queue.length > 0) {
      const feed = queue.shift();
      if (!feed) return;
      const parsed = await fetchAndParseFeed(feed.url);
      const now = new Date();
      if (!parsed.ok) {
        feedsFailed += 1;
        errors.push({ feed: feed.name, error: parsed.error ?? "Failed" });
        await db
          .update(newsFeeds)
          .set({
            lastFetchedAt: now,
            lastError: parsed.error ?? "Failed",
            updatedAt: now,
          })
          .where(eq(newsFeeds.id, feed.id));
        continue;
      }
      // Dedupe — pull existing guids in one query
      const existing = await db
        .select({ guid: newsItems.guid })
        .from(newsItems)
        .where(
          and(
            eq(newsItems.feedId, feed.id),
            inArray(
              newsItems.guid,
              parsed.items.map((i) => i.guid),
            ),
          ),
        );
      const existingSet = new Set(existing.map((e) => e.guid));
      const fresh = parsed.items.filter((i) => !existingSet.has(i.guid));
      if (fresh.length > 0) {
        await db.insert(newsItems).values(
          fresh.map((i) => ({
            feedId: feed.id,
            guid: i.guid,
            title: i.title.slice(0, 500),
            link: i.link,
            summary: i.summary,
            author: i.author,
            publishedAt: i.publishedAt,
          })),
        );
        itemsAdded += fresh.length;
      }
      await db
        .update(newsFeeds)
        .set({ lastFetchedAt: now, lastError: null, updatedAt: now })
        .where(eq(newsFeeds.id, feed.id));
    }
  }

  await Promise.all(Array.from({ length: 3 }, () => worker()));

  revalidatePath("/news");
  return {
    feedsChecked: feeds.length,
    feedsFailed,
    itemsAdded,
    errors,
  };
}

export async function listRecentItems(limit = 60) {
  return db
    .select({
      id: newsItems.id,
      feedId: newsItems.feedId,
      title: newsItems.title,
      link: newsItems.link,
      summary: newsItems.summary,
      author: newsItems.author,
      publishedAt: newsItems.publishedAt,
      capturedAt: newsItems.capturedAt,
      feedName: newsFeeds.name,
      feedCategory: newsFeeds.category,
    })
    .from(newsItems)
    .leftJoin(newsFeeds, eq(newsItems.feedId, newsFeeds.id))
    .orderBy(desc(newsItems.publishedAt), desc(newsItems.capturedAt))
    .limit(limit);
}
