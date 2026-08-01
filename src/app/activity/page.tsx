import { and, desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  Activity,
  Users,
  ClipboardList,
  ListChecks,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { db } from "@/db/client";
import { activityLog, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { clientScope } from "@/lib/client-scope";

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

type SearchParams = { kind?: string; level?: string; client?: string };

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const kindFilter = sp.kind ?? "";
  const levelFilter = sp.level ?? "";
  const clientFilter = sp.client ? Number(sp.client) : null;

  const conds = [];
  if (kindFilter) conds.push(eq(activityLog.kind, kindFilter));
  if (levelFilter)
    conds.push(
      eq(
        activityLog.level,
        levelFilter as "info" | "success" | "warning" | "error",
      ),
    );
  if (clientFilter !== null)
    conds.push(eq(activityLog.clientId, clientFilter));
  const where = conds.length > 0 ? and(...conds) : undefined;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  // Counts for filter chips (computed once)
  const allRowsForCounts = await db
    .select({ kind: activityLog.kind, level: activityLog.level })
    .from(activityLog);
  const kindCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  for (const r of allRowsForCounts) {
    kindCounts.set(r.kind, (kindCounts.get(r.kind) ?? 0) + 1);
    levelCounts.set(r.level, (levelCounts.get(r.level) ?? 0) + 1);
  }
  const topKinds = Array.from(kindCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

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
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(200);

  const buildHref = (overrides: Partial<SearchParams>) => {
    const p = new URLSearchParams();
    const merged = { kind: kindFilter, level: levelFilter, client: sp.client };
    for (const [k, v] of Object.entries({ ...merged, ...overrides })) {
      if (v) p.set(k, String(v));
    }
    const q = p.toString();
    return q ? `/activity?${q}` : "/activity";
  };
  const pill = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[11px] ring-1 ring-inset transition-colors ${
      active
        ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
        : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
    }`;

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
        description="Everything that happened — audits, client creates, page changes, outreach, completed tasks. Filter by kind / level / client."
        icon={Activity}
        accent="cyan"
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs text-muted-foreground ring-1 ring-inset ring-white/10">
            {rows.length} of {allRowsForCounts.length} entries
          </span>
        }
      />

      <section className="space-y-2 rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="size-3 text-muted-foreground" />
          <Link href={buildHref({ kind: undefined })} className={pill(!kindFilter)}>
            All kinds
          </Link>
          {topKinds.map(([k, n]) => (
            <Link key={k} href={buildHref({ kind: k })} className={pill(kindFilter === k)}>
              <code className="font-mono text-[10px]">{k}</code> ({n})
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Level
          </span>
          <Link href={buildHref({ level: undefined })} className={pill(!levelFilter)}>
            Any
          </Link>
          {(["info", "success", "warning", "error"] as const).map((lv) => {
            const n = levelCounts.get(lv) ?? 0;
            if (n === 0 && levelFilter !== lv) return null;
            return (
              <Link key={lv} href={buildHref({ level: lv })} className={pill(levelFilter === lv)}>
                {lv} ({n})
              </Link>
            );
          })}
        </div>
        {allClients.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Client
            </span>
            <Link
              href={buildHref({ client: undefined })}
              className={pill(clientFilter === null)}
            >
              Any
            </Link>
            {allClients.map((c) => (
              <Link
                key={c.id}
                href={buildHref({ client: String(c.id) })}
                className={pill(clientFilter === c.id)}
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <EmptyState
            icon={Activity}
            title="No activity yet"
            body="Every audit, ranking change, task completion, and outreach event gets logged here as you work. Add a client to start the timeline."
            primary={{ href: "/clients/new", label: "Add a client" }}
            secondary={{ href: "/audits", label: "Run an audit" }}
          />
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
