export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq, asc, desc } from "drizzle-orm";
import {
  ExternalLink,
  Megaphone,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { db } from "@/db/client";
import { brandMentions, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { RunButton } from "./run-button";
import { deleteMention } from "../../actions";
import { markSectionSeen } from "@/lib/unread-counts";
import { clientScope } from "@/lib/client-scope";
import { SentimentChart, type SentimentBucket } from "./sentiment-chart";
import { MentionToOutreachButton } from "./mention-to-outreach";

void markSectionSeen;

const SOURCE_TONE: Record<string, string> = {
  reddit: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  hackernews: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  bluesky: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  mastodon: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  rss: "bg-white/10 text-muted-foreground ring-white/10",
};

export default async function PerClientBrandMonitorPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const mentions = await db
    .select()
    .from(brandMentions)
    .where(eq(brandMentions.clientId, clientId))
    .orderBy(desc(brandMentions.publishedAt))
    .limit(200);

  const summary = mentions.reduce(
    (acc, m) => {
      if (m.sentiment > 0) acc.positive++;
      else if (m.sentiment < 0) acc.negative++;
      else acc.neutral++;
      if (m.linksToClient) acc.unlinked++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0, unlinked: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/brand-monitor/c"
        toolLabel="Brand monitor"
        icon={Megaphone}
      />

      <PageHeader
        title={`Brand mentions · ${client.name}`}
        description="Surface unlinked mentions, monitor sentiment, react fast to negatives. Click run to fetch a fresh batch."
        icon={Megaphone}
        accent="amber"
        meta={<RunButton clientId={client.id} />}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total" value={mentions.length} tone="neutral" />
        <Stat label="Positive" value={summary.positive} tone="emerald" />
        <Stat label="Negative" value={summary.negative} tone="rose" />
        <Stat label="Linked to site" value={summary.unlinked} tone="violet" />
      </div>

      {mentions.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Sentiment trend (60 days)</h2>
          </header>
          <div className="p-5">
            <SentimentChart buckets={bucketSentiment(mentions, 60)} />
          </div>
        </section>
      )}

      {mentions.length === 0 ? (
        <div className="glass-apple rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          No mentions yet. Click <strong>Scan now</strong> above.
        </div>
      ) : (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <ul className="divide-y divide-white/[0.04]">
            {mentions.map((m) => (
              <li key={m.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${SOURCE_TONE[m.source] ?? SOURCE_TONE.rss}`}
                      >
                        {m.source}
                      </span>
                      {m.sentiment > 0 && (
                        <ThumbsUp className="size-3.5 text-emerald-300" />
                      )}
                      {m.sentiment < 0 && (
                        <ThumbsDown className="size-3.5 text-rose-300" />
                      )}
                      {m.linksToClient && (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/30">
                          links to your site
                        </span>
                      )}
                      {m.author && (
                        <span className="text-[11px] text-muted-foreground">
                          @{m.author}
                        </span>
                      )}
                      {m.publishedAt && (
                        <span className="text-[11px] text-muted-foreground">
                          · {m.publishedAt.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                    >
                      {m.title}
                      <ExternalLink className="size-3 opacity-60" />
                    </a>
                    {m.excerpt && (
                      <p className="line-clamp-3 text-xs text-muted-foreground">
                        {m.excerpt}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <MentionToOutreachButton
                      mentionId={m.id}
                      clientId={clientId}
                      authorName={m.author}
                      url={m.url}
                    />
                    <form action={deleteMention.bind(null, m.id)}>
                      <button
                        type="submit"
                        aria-label="Delete"
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <X className="size-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function bucketSentiment(
  mentions: { sentiment: number; publishedAt: Date | null; capturedAt: Date }[],
  days: number,
): SentimentBucket[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets = new Map<string, SentimentBucket>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { date: key, positive: 0, neutral: 0, negative: 0 });
  }
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  for (const m of mentions) {
    const dt = m.publishedAt ?? m.capturedAt;
    if (dt < cutoff) continue;
    const key = dt.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (!b) continue;
    if (m.sentiment > 0) b.positive++;
    else if (m.sentiment < 0) b.negative++;
    else b.neutral++;
  }
  return Array.from(buckets.values());
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "emerald" | "rose" | "violet";
}) {
  const toneClass = {
    neutral: "text-foreground",
    emerald: "text-emerald-300",
    rose: "text-rose-300",
    violet: "text-violet-300",
  }[tone];
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
