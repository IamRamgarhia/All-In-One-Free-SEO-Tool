export const dynamic = "force-dynamic";

import { desc, inArray, or, like } from "drizzle-orm";
import {
  ExternalLink,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { db } from "@/db/client";
import { newsFeeds, newsItems } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { seedDefaultFeedsIfEmpty } from "@/app/news/actions";
import { RefreshFeedsButton } from "@/app/news/refresh-button";

type UpdateType = "core" | "spam" | "helpful_content" | "product_review" | "ai" | "other";

type Update = {
  date: string; // YYYY-MM-DD
  endDate?: string;
  name: string;
  type: UpdateType;
  summary: string;
  url?: string;
  source: "curated" | "live";
};

const CURATED: Update[] = [
  {
    date: "2025-12-04",
    endDate: "2025-12-19",
    name: "December 2025 Core Update",
    type: "core",
    summary:
      "Routine core update — typical 2-3 week rollout, broad ranking shifts.",
    source: "curated",
  },
  {
    date: "2025-09-08",
    endDate: "2025-09-22",
    name: "September 2025 Core Update",
    type: "core",
    summary:
      "Significant shifts on commercial queries; many sites that gained from earlier helpful-content adjustments saw partial recovery.",
    source: "curated",
  },
  {
    date: "2025-06-30",
    endDate: "2025-07-17",
    name: "June 2025 Core Update",
    type: "core",
    summary: "Core update with broader weighting toward original content.",
    source: "curated",
  },
  {
    date: "2025-03-13",
    endDate: "2025-03-27",
    name: "March 2025 Core Update",
    type: "core",
    summary:
      "First confirmed core update of 2025. Heavy impact on aggregator/affiliate sites.",
    source: "curated",
  },
  {
    date: "2024-12-12",
    endDate: "2024-12-18",
    name: "December 2024 Core Update",
    type: "core",
    summary: "Final core update of 2024; faster than usual rollout.",
    source: "curated",
  },
  {
    date: "2024-11-11",
    endDate: "2024-12-05",
    name: "November 2024 Core Update",
    type: "core",
    summary:
      "Long rollout; many sites saw fluctuations both up and down before settling.",
    source: "curated",
  },
  {
    date: "2024-08-15",
    endDate: "2024-09-03",
    name: "August 2024 Core Update",
    type: "core",
    summary:
      "Aimed to surface 'genuinely useful' content; some HCU-impacted sites partially recovered.",
    source: "curated",
  },
  {
    date: "2024-06-20",
    name: "Spam Update June 2024",
    type: "spam",
    summary: "Targeted scaled content abuse + expired-domain abuse.",
    source: "curated",
  },
  {
    date: "2024-05-14",
    name: "AI Overviews launch (US)",
    type: "ai",
    summary:
      "Generative AI answers rolled out at the top of US SERPs — material click-through impact on informational queries.",
    source: "curated",
  },
  {
    date: "2024-03-05",
    endDate: "2024-04-19",
    name: "March 2024 Core + Spam Update",
    type: "core",
    summary:
      "Joint core + spam update — Google announced 40% reduction in 'unhelpful content'. Many low-quality AI sites hit hard.",
    source: "curated",
  },
  {
    date: "2023-11-02",
    endDate: "2023-11-28",
    name: "November 2023 Core Update",
    type: "core",
    summary: "Standard core update.",
    source: "curated",
  },
  {
    date: "2023-09-14",
    endDate: "2023-09-28",
    name: "Helpful Content Update — September 2023",
    type: "helpful_content",
    summary:
      "The big one. Sites generating thin/aggregator/AI content saw 50-80% traffic drops with little recovery.",
    source: "curated",
  },
];

const typeStyle: Record<UpdateType, { label: string; tone: string }> = {
  core: {
    label: "Core",
    tone: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
  spam: {
    label: "Spam",
    tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
  helpful_content: {
    label: "Helpful content",
    tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  product_review: {
    label: "Reviews",
    tone: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  ai: {
    label: "AI",
    tone: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  },
  other: {
    label: "Update",
    tone: "bg-white/5 text-muted-foreground ring-white/10",
  },
};

function classifyByTitle(title: string): UpdateType {
  const t = title.toLowerCase();
  if (/spam update/.test(t)) return "spam";
  if (/helpful content/.test(t)) return "helpful_content";
  if (/product review/.test(t)) return "product_review";
  if (/ai overview|generative/.test(t)) return "ai";
  if (/core update/.test(t)) return "core";
  return "other";
}

function isAlgorithmUpdate(title: string, summary: string | null): boolean {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  return (
    /core update|spam update|helpful content|product review|reviews update|ranking system|ai overview|search ranking|algorithm/.test(
      text,
    )
  );
}

async function fetchLiveUpdates(): Promise<Update[]> {
  // Pull from the official Google feeds we seeded — Search Central blog + Status Dashboard
  const googleFeeds = await db
    .select({ id: newsFeeds.id, name: newsFeeds.name })
    .from(newsFeeds)
    .where(
      or(
        like(newsFeeds.url, "%developers.google.com/search%"),
        like(newsFeeds.url, "%status.search.google.com%"),
      ),
    );

  if (googleFeeds.length === 0) return [];

  const feedIds = googleFeeds.map((f) => f.id);
  const items = await db
    .select()
    .from(newsItems)
    .where(inArray(newsItems.feedId, feedIds))
    .orderBy(desc(newsItems.publishedAt))
    .limit(60);

  return items
    .filter((i) => isAlgorithmUpdate(i.title, i.summary))
    .map<Update>((i) => ({
      date: (i.publishedAt ?? i.capturedAt).toISOString().slice(0, 10),
      name: i.title,
      type: classifyByTitle(i.title),
      summary: i.summary?.slice(0, 240) ?? "",
      url: i.link,
      source: "live",
    }));
}

export default async function AlgorithmUpdatesPage() {
  // Make sure the Google feeds exist; first-time visitors get them seeded
  await seedDefaultFeedsIfEmpty();

  const live = await fetchLiveUpdates();

  // Merge curated + live, de-dupe by date+name prefix, sort newest first
  const seen = new Set<string>();
  const merged: Update[] = [];
  for (const u of [...live, ...CURATED]) {
    const key = `${u.date}|${u.name.toLowerCase().slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(u);
  }
  merged.sort((a, b) => b.date.localeCompare(a.date));

  const lastSync = await db
    .select({ at: newsFeeds.lastFetchedAt, name: newsFeeds.name })
    .from(newsFeeds)
    .where(
      or(
        like(newsFeeds.url, "%developers.google.com/search%"),
        like(newsFeeds.url, "%status.search.google.com%"),
      ),
    );
  const newest = lastSync
    .map((s) => s.at?.getTime() ?? 0)
    .reduce((m, t) => Math.max(m, t), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Google algorithm updates"
        description="Auto-pulled from Google's own RSS (Search Central Blog + Search Status Dashboard) plus a hand-curated history. Click Refresh to fetch the latest."
        icon={Lock}
        accent="violet"
        actions={<RefreshFeedsButton />}
      />

      {/* Sources strip */}
      <section className="glass-apple relative overflow-hidden rounded-2xl p-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-foreground">Official sources:</span>
          <a
            href="https://developers.google.com/search/blog"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
          >
            Search Central Blog
            <ExternalLink className="size-3" />
          </a>
          <a
            href="https://status.search.google.com/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
          >
            Search Status Dashboard
            <ExternalLink className="size-3" />
          </a>
          <a
            href="https://developers.google.com/search/updates/ranking"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
          >
            Ranking updates page
            <ExternalLink className="size-3" />
          </a>
          {newest > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
              <RefreshCw className="size-3" />
              Last sync {new Date(newest).toLocaleString()}
            </span>
          )}
        </div>
      </section>

      <div className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <p className="text-xs text-muted-foreground">
            <span className="inline-flex rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              live
            </span>{" "}
            badges = pulled from Google&apos;s own RSS just now.{" "}
            <span className="inline-flex rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
              curated
            </span>{" "}
            = hand-written summary in our codebase.
          </p>
        </header>
        <ul className="divide-y divide-white/[0.04]">
          {merged.map((u) => {
            const cfg = typeStyle[u.type];
            return (
              <li key={u.date + u.name} className="flex gap-4 px-5 py-4">
                <div className="w-28 shrink-0 text-xs">
                  <div className="font-mono font-semibold text-foreground">
                    {u.date}
                  </div>
                  {u.endDate && (
                    <div className="font-mono text-[11px] text-muted-foreground">
                      → {u.endDate}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${cfg.tone}`}
                    >
                      {cfg.label}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                        u.source === "live"
                          ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                          : "bg-white/5 text-muted-foreground ring-white/10"
                      }`}
                    >
                      {u.source}
                    </span>
                    <h3 className="font-semibold">{u.name}</h3>
                    {u.url && (
                      <a
                        href={u.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                      >
                        official page
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {u.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
          <Sparkles className="size-4 text-violet-300" />
          How auto-update works
        </h2>
        <ol className="space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">1.</strong> The two Google
            sources above are pre-seeded as RSS feeds in{" "}
            <a href="/news" className="text-violet-300 hover:underline">
              /news
            </a>{" "}
            on first launch.
          </li>
          <li>
            <strong className="text-foreground">2.</strong> Click{" "}
            <strong>Refresh feeds</strong> here or on the news page to pull the
            latest items.
          </li>
          <li>
            <strong className="text-foreground">3.</strong> We filter for
            algorithm-update keywords (core, spam, helpful content, AI overview,
            ranking system) and merge with the curated list above. Each live
            entry links straight to Google&apos;s official announcement.
          </li>
          <li>
            <strong className="text-foreground">4.</strong> Want fully
            hands-off? Schedule the news refresh as a recurring job in
            Settings → Notifications (or add a cron that hits the dev server
            occasionally).
          </li>
        </ol>
      </section>
    </div>
  );
}
