export const dynamic = "force-dynamic";

import { ExternalLink, Lock, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { SHIPPED_UPDATES_FETCHED_AT } from "@/lib/algorithm-updates";
import type { RankingUpdateType } from "@/lib/google-status";
import {
  getRankingUpdates,
  rankingUpdatesRefreshedAt,
} from "@/lib/google-updates-store";
import { RefreshGoogleUpdatesButton } from "./refresh-button";

const typeStyle: Record<RankingUpdateType, { label: string; tone: string }> = {
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
  issue: {
    label: "Ranking issue",
    tone: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  },
  other: {
    label: "Update",
    tone: "bg-white/5 text-muted-foreground ring-white/10",
  },
};

const day = (iso: string) => new Date(iso).toLocaleDateString();

export default async function AlgorithmUpdatesPage() {
  const [updates, refreshedAt] = await Promise.all([
    getRankingUpdates(),
    rankingUpdatesRefreshedAt(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Google algorithm updates"
        description="Every ranking update and ranking issue Google has posted to its Search Status Dashboard, with Google's own announcement. Checked daily."
        icon={Lock}
        accent="violet"
        actions={<RefreshGoogleUpdatesButton />}
      />

      <section className="glass-apple relative overflow-hidden rounded-2xl p-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-foreground">Source:</span>
          <a
            href="https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
          >
            Search Status Dashboard
            <ExternalLink className="size-3" />
          </a>
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            <RefreshCw className="size-3" />
            {refreshedAt
              ? `Last checked ${day(refreshedAt)}`
              : `Not checked yet · history as of ${day(SHIPPED_UPDATES_FETCHED_AT)}`}
          </span>
        </div>
      </section>

      <div className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Dates are the US/Pacific dates Google prints. The text under each
            one is Google&apos;s announcement. Google does not say which kinds of
            site gained or lost, so neither does this page.
          </p>
        </header>
        <ul className="divide-y divide-white/[0.04]">
          {updates.map((u) => {
            const cfg = typeStyle[u.type] ?? typeStyle.other;
            return (
              <li key={u.id} className="flex gap-4 px-5 py-4">
                <div className="w-28 shrink-0 text-xs">
                  <div className="font-mono font-semibold text-foreground">
                    {u.date}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    {u.endDate ? `→ ${u.endDate}` : "rolling out"}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset ${cfg.tone}`}
                    >
                      {cfg.label}
                    </span>
                    <h3 className="font-semibold">{u.name}</h3>
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Google&apos;s page
                      <ExternalLink className="size-3" />
                    </a>
                  </div>
                  {u.summary && (
                    <p className="mt-1 text-sm text-muted-foreground">{u.summary}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
