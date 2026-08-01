export const dynamic = "force-dynamic";

import Link from "next/link";
import { count, eq, sql, and, gte } from "drizzle-orm";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Users,
} from "lucide-react";
import { db } from "@/db/client";
import { audits, clients, tasks } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";

const ESTIMATED_HOURS_PER_TASK = 0.75;

export default async function CapacityPage() {
  const allClients = await db
    .select({
      id: clients.id,
      name: clients.name,
      url: clients.url,
      logoUrl: clients.logoUrl,
      niche: clients.niche,
    })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);

  // Per-client task counts: open, done-this-month, total
  const perClientStats = await Promise.all(
    allClients.map(async (c) => {
      const [openTasks] = await db
        .select({ value: count() })
        .from(tasks)
        .where(and(eq(tasks.clientId, c.id), sql`${tasks.status} != 'done'`));

      const [doneThisMonth] = await db
        .select({ value: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.clientId, c.id),
            eq(tasks.status, "done"),
            gte(tasks.updatedAt, monthAgo),
          ),
        );

      const [highPriOpen] = await db
        .select({ value: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.clientId, c.id),
            eq(tasks.priority, "high"),
            sql`${tasks.status} != 'done'`,
          ),
        );

      const [recentAuditCount] = await db
        .select({ value: count() })
        .from(audits)
        .where(
          and(eq(audits.clientId, c.id), gte(audits.createdAt, monthAgo)),
        );

      const open = openTasks.value;
      const doneCount = doneThisMonth.value;
      const highPri = highPriOpen.value;
      const audited = recentAuditCount.value;

      const projectedOpenHours = open * ESTIMATED_HOURS_PER_TASK;
      const deliveredHours = doneCount * ESTIMATED_HOURS_PER_TASK;

      return {
        client: c,
        open,
        doneCount,
        highPri,
        audited,
        projectedOpenHours,
        deliveredHours,
      };
    }),
  );

  const totalOpen = perClientStats.reduce((s, x) => s + x.open, 0);
  const totalDone = perClientStats.reduce((s, x) => s + x.doneCount, 0);
  const totalHighPri = perClientStats.reduce((s, x) => s + x.highPri, 0);
  const totalDeliveredHours = perClientStats.reduce(
    (s, x) => s + x.deliveredHours,
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Capacity"
        description="What every client owes you and what every client is getting. Quick read on overbooked weeks, retainer burn, and which clients are getting starved."
        icon={Users}
        accent="violet"
      />

      {/* Aggregate stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          icon={ClipboardList}
          label="Open tasks"
          value={totalOpen.toString()}
          tone="amber"
        />
        <Stat
          icon={AlertTriangle}
          label="High priority open"
          value={totalHighPri.toString()}
          tone="rose"
        />
        <Stat
          icon={CheckCircle2}
          label="Tasks done · 30d"
          value={totalDone.toString()}
          tone="emerald"
        />
        <Stat
          icon={Clock}
          label="Hours delivered · 30d"
          value={`${totalDeliveredHours.toFixed(1)}h`}
          tone="violet"
        />
      </div>

      {allClients.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          Add clients first — capacity is a per-client view.
        </div>
      ) : (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">Per-client load</h2>
            <p className="text-[11px] text-muted-foreground">
              Estimates assume {ESTIMATED_HOURS_PER_TASK}h average per task.
              Sorted by open task count — top rows are where you owe the most
              work.
            </p>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Client</th>
                <th className="px-3 py-3 text-right font-medium">Open</th>
                <th className="px-3 py-3 text-right font-medium">High pri</th>
                <th className="px-3 py-3 text-right font-medium">Done · 30d</th>
                <th className="px-3 py-3 text-right font-medium">Audits · 30d</th>
                <th className="px-3 py-3 text-right font-medium">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {perClientStats
                .sort((a, b) => b.open - a.open)
                .map(({ client: c, ...s }) => (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <Link
                        href={`/clients/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {c.url.replace(/^https?:\/\//, "")}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {s.open}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {s.highPri > 0 ? (
                        <span className="font-bold text-rose-300">
                          {s.highPri}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-300">
                      {s.doneCount}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {s.audited}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <div>{s.deliveredHours.toFixed(1)}h</div>
                      {s.projectedOpenHours > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{s.projectedOpenHours.toFixed(1)}h queued
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="glass-apple relative overflow-hidden rounded-2xl p-5 text-sm">
        <h2 className="text-base font-semibold">Reading this view</h2>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>
            <strong className="text-foreground">High open + 0 done:</strong>{" "}
            client is being starved — pull tasks from a less-busy client this
            week.
          </li>
          <li>
            <strong className="text-foreground">High pri &gt; 0:</strong>{" "}
            urgent items waiting. Triage before adding new work.
          </li>
          <li>
            <strong className="text-foreground">0 audits in 30d:</strong>{" "}
            run a fresh audit so you have data for the next monthly report.
          </li>
        </ul>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  tone: "amber" | "rose" | "emerald" | "violet";
}) {
  const toneCls: Record<typeof tone, string> = {
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  };
  return (
    <div className="glass-apple relative overflow-hidden rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <div
          className={`flex size-8 items-center justify-center rounded-lg ring-1 ring-inset ${toneCls[tone]}`}
        >
          <Icon className="size-4" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

