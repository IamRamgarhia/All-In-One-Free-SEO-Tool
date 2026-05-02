import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  Activity,
  Users,
  ClipboardList,
  ListChecks,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { activityLog, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";

const kindMeta: Record<
  string,
  { icon: typeof Activity; tone: string }
> = {
  "client.created": {
    icon: Users,
    tone: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
  "client.deleted": {
    icon: Users,
    tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
  "audit.completed": {
    icon: ClipboardList,
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  "audit.failed": {
    icon: AlertCircle,
    tone: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  },
  "task.completed": {
    icon: CheckCircle2,
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  "task.created": {
    icon: ListChecks,
    tone: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  },
  "page.changed": {
    icon: AlertTriangle,
    tone: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30",
  },
  "rank.changed": {
    icon: Activity,
    tone: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  },
  "report.generated": {
    icon: ClipboardList,
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
  "outreach.contacted": {
    icon: Activity,
    tone: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
  "outreach.replied": {
    icon: CheckCircle2,
    tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  },
};

export default async function ActivityPage() {
  const rows = await db
    .select({
      id: activityLog.id,
      kind: activityLog.kind,
      message: activityLog.message,
      level: activityLog.level,
      createdAt: activityLog.createdAt,
      clientId: activityLog.clientId,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      clientName: clients.name,
    })
    .from(activityLog)
    .leftJoin(clients, eq(activityLog.clientId, clients.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(200);

  // Group by day
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.createdAt.toLocaleDateString();
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Activity"
        description="Everything that happened — audits, client creates, page changes, outreach, completed tasks. Newest first."
        icon={Activity}
        accent="cyan"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
            {rows.length} entries
          </span>
        }
      />

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No activity yet. Run an audit, add a client, or log outreach to start
          building history.
        </div>
      ) : (
        Array.from(byDay.entries()).map(([day, list]) => (
          <section
            key={day}
            className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
          >
            <header className="border-b border-white/5 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {day}
            </header>
            <ul className="divide-y divide-white/5">
              {list.map((r) => {
                const cfg = kindMeta[r.kind] ?? {
                  icon: Activity,
                  tone: "bg-white/5 text-muted-foreground ring-white/10",
                };
                const Icon = cfg.icon;
                const href =
                  r.entityType === "audit"
                    ? `/audits/${r.entityId}`
                    : r.clientId
                      ? `/clients/${r.clientId}`
                      : null;
                return (
                  <li
                    key={r.id}
                    className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]"
                  >
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset ${cfg.tone}`}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 text-sm">
                        {href ? (
                          <Link
                            href={href}
                            className="font-medium hover:underline"
                          >
                            {r.message}
                          </Link>
                        ) : (
                          <span className="font-medium">{r.message}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{r.kind}</span>
                        {r.clientName && <span>· {r.clientName}</span>}
                        <span>· {r.createdAt.toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
