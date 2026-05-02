export const dynamic = "force-dynamic";

import { db } from "@/db/client";
import { newsFeeds } from "@/db/schema";
import { desc } from "drizzle-orm";
import { ExternalLink, Newspaper, Rss } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import {
  listRecentItems,
  seedDefaultFeedsIfEmpty,
} from "./actions";
import { RefreshFeedsButton } from "./refresh-button";
import { AddFeedForm, FeedRow } from "./add-feed-form";
import { CleanupBar, DeleteItemButton } from "./cleanup-bar";

export default async function NewsPage() {
  // Seed defaults on first visit so user has something to read immediately
  await seedDefaultFeedsIfEmpty();

  const [feeds, items] = await Promise.all([
    db.select().from(newsFeeds).orderBy(desc(newsFeeds.createdAt)),
    listRecentItems(80),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="SEO news"
        description="Live feed from Google + top SEO publishers + any custom RSS you add. No API keys — just RSS / Atom / JSON Feed parsing. Click refresh to pull latest."
        icon={Newspaper}
        accent="violet"
        actions={<RefreshFeedsButton />}
      />

      {/* Items */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">
              Latest items {items.length > 0 && `(${items.length})`}
            </h2>
            {items.length === 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                No items yet — click <strong>Refresh feeds</strong> above to
                pull the first batch.
              </p>
            )}
          </div>
          {items.length > 0 && <CleanupBar />}
        </header>
        {items.length > 0 && (
          <ul className="divide-y divide-white/[0.04]">
            {items.map((it) => (
              <li
                key={it.id}
                className="group/item flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
              >
                <Rss className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <a
                    href={it.link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                  >
                    {it.title}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                  {it.summary && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {it.summary}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {it.feedName && (
                      <span className="rounded-full bg-white/5 px-1.5 py-0.5 ring-1 ring-inset ring-white/10">
                        {it.feedName}
                      </span>
                    )}
                    {it.author && <span>· {it.author}</span>}
                    {(it.publishedAt ?? it.capturedAt) && (
                      <span>
                        ·{" "}
                        {(it.publishedAt ?? it.capturedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="opacity-0 transition-opacity group-hover/item:opacity-100">
                  <DeleteItemButton id={it.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add feed */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold">Add a custom feed</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Paste any RSS / Atom / JSON Feed URL. Works for blogs, GitHub
            release feeds, Reddit subreddit feeds, and via RSSHub also Twitter
            hashtags / YouTube channels / etc.
          </p>
        </header>
        <div className="p-5">
          <AddFeedForm />
        </div>
      </section>

      {/* Feed list */}
      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold">Configured feeds ({feeds.length})</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Toggle to disable without deleting. Removing a feed also deletes
            its captured items.
          </p>
        </header>
        <ul className="divide-y divide-white/[0.04]">
          {feeds.map((f) => (
            <FeedRow key={f.id} feed={f} />
          ))}
        </ul>
      </section>
    </div>
  );
}
