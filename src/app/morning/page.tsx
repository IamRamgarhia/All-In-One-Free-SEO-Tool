export const dynamic = "force-dynamic";

import { Sparkles, Sun } from "lucide-react";
import { count, desc, eq, ne, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, clients, keywordRankings, tasks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { MorningBriefing } from "../morning-briefing";

export default async function MorningPage() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [{ value: clientCount }] = await db.select({ value: count() }).from(clients);
  const [{ value: openTasks }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(ne(tasks.status, "done"));
  const [{ value: doneTasksWeek }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(eq(tasks.status, "done"));

  const recentAudits = await db
    .select()
    .from(audits)
    .where(gte(audits.createdAt, weekAgo))
    .orderBy(desc(audits.createdAt))
    .limit(10);
  const last24Audits = recentAudits.filter((a) => a.createdAt >= dayAgo).length;

  // Striking-distance keywords (positions 4-15)
  const allRanks = await db
    .select()
    .from(keywordRankings)
    .where(gte(keywordRankings.checkedAt, weekAgo))
    .orderBy(keywordRankings.checkedAt);
  const latestPos = new Map<number, number | null>();
  for (const r of allRanks) {
    if (r.position !== null) latestPos.set(r.keywordId, r.position);
  }
  let striking = 0;
  for (const p of latestPos.values()) {
    if (p !== null && p >= 4 && p <= 15) striking += 1;
  }

  // Trends — clients with audit score change
  const recentByClient = new Map<number, { latest: number; prev: number | null }>();
  for (const a of recentAudits) {
    if (a.score === null) continue;
    const cur = recentByClient.get(a.clientId);
    if (!cur) {
      recentByClient.set(a.clientId, { latest: a.score, prev: null });
    } else if (cur.prev === null) {
      cur.prev = a.score;
    }
  }
  let dropped = 0,
    improved = 0;
  for (const v of recentByClient.values()) {
    if (v.prev === null) continue;
    if (v.latest < v.prev - 3) dropped += 1;
    else if (v.latest > v.prev + 3) improved += 1;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Morning briefing"
        description={`${greet()}. Here's what needs attention across all ${clientCount} clients.`}
        icon={Sun}
        accent="amber"
      />

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Open tasks" value={openTasks.toLocaleString()} hint={`${doneTasksWeek} done all-time`} />
        <Stat
          label="Audits in 24h"
          value={last24Audits.toString()}
          hint={`${recentAudits.length} this week`}
          tone={last24Audits === 0 && clientCount > 0 ? "amber" : "emerald"}
        />
        <Stat
          label="Score drops (week)"
          value={dropped.toString()}
          tone={dropped > 0 ? "rose" : "emerald"}
          hint={improved > 0 ? `${improved} improved` : "no improvements"}
        />
        <Stat
          label="Striking distance"
          value={striking.toString()}
          tone="violet"
          hint="positions 4-15"
        />
      </div>

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-amber-300" />
            Today&apos;s priority items
          </h2>
        </header>
        <div className="p-5">
          <MorningBriefing />
        </div>
      </section>
    </div>
  );
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "emerald" | "amber" | "rose" | "violet";
}) {
  const t = tone
    ? {
        emerald: "text-emerald-300",
        amber: "text-amber-300",
        rose: "text-rose-300",
        violet: "text-violet-300",
      }[tone]
    : "";
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${t}`}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
