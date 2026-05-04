export const dynamic = "force-dynamic";

import { Beaker, ExternalLink, X } from "lucide-react";
import { db } from "@/db/client";
import { clients, titleTests } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { CreateTitleTestForm } from "./create-form";
import { cancelTitleTest, deleteTitleTest } from "./actions";

const STATUS_TONE: Record<string, string> = {
  running: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  paused: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

export default async function TitleTestsPage() {
  const [allClients, tests] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .orderBy(asc(clients.name)),
    db.select().from(titleTests).orderBy(desc(titleTests.createdAt)).limit(80),
  ]);

  const clientName = new Map(allClients.map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Title A/B testing"
        description="Rotate 2-5 candidate titles for a single page over multi-week periods. Daily-agent picks the winner by GSC CTR. Requires the WordPress bridge to push rotations."
        icon={Beaker}
        accent="violet"
      />

      <CreateTitleTestForm clients={allClients} />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-4">
          <h2 className="text-base font-semibold">
            Active tests ({tests.length})
          </h2>
        </header>
        {tests.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No title tests yet. Create one above to start rotating variants.
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {tests.map((t) => (
              <li key={t.id} className="px-5 py-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={t.pageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 truncate font-medium hover:underline"
                      >
                        {t.pageUrl.replace(/^https?:\/\/[^/]+/, "")}
                        <ExternalLink className="size-3 opacity-60" />
                      </a>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${STATUS_TONE[t.status]}`}
                      >
                        {t.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {clientName.get(t.clientId) ?? `Client #${t.clientId}`}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        · {t.variantDurationDays}d cycle
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {t.status === "running" && (
                      <form action={cancelTitleTest.bind(null, t.id)}>
                        <button
                          type="submit"
                          className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                        >
                          Pause
                        </button>
                      </form>
                    )}
                    <form action={deleteTitleTest.bind(null, t.id)}>
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

                <div className="rounded-md bg-black/20 px-3 py-2">
                  <ol className="space-y-1 text-xs">
                    {t.variants.map((v, i) => {
                      const isCurrent = i === t.currentVariantIdx;
                      const isWinner = i === t.winnerVariantIdx;
                      const measurements = (t.measurements ?? []).filter(
                        (m) => m.variantIdx === i,
                      );
                      const totalImpressions = measurements.reduce(
                        (s, m) => s + m.impressions,
                        0,
                      );
                      const totalClicks = measurements.reduce(
                        (s, m) => s + m.clicks,
                        0,
                      );
                      const ctr =
                        totalImpressions > 0
                          ? (totalClicks / totalImpressions) * 100
                          : null;
                      return (
                        <li key={i} className="flex items-center gap-2">
                          <span
                            className={`size-1.5 shrink-0 rounded-full ${isCurrent ? "bg-emerald-400" : "bg-muted-foreground/30"}`}
                          />
                          <span className={isCurrent ? "font-medium" : ""}>
                            {v.title}
                          </span>
                          {isWinner && (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                              winner
                            </span>
                          )}
                          {ctr !== null && (
                            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                              {totalClicks}/{totalImpressions} · CTR {ctr.toFixed(2)}%
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
