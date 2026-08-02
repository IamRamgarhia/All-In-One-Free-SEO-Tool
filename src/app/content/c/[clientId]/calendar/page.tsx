export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc, and, gte, lt } from "drizzle-orm";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Plus,
} from "lucide-react";
import { db } from "@/db/client";
import { clients, contentBriefs, type ContentBrief } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { clientScope } from "@/lib/client-scope";

const statusTone: Record<ContentBrief["status"], string> = {
  idea: "bg-white/5 text-muted-foreground ring-white/10",
  outline: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  draft: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  review: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  published: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

const monthLabel = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

export default async function ContentCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { clientId: cidStr } = await params;
  const sp = await searchParams;
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

  const today = new Date();
  let cursor: Date;
  if (sp.m && /^\d{4}-\d{2}$/.test(sp.m)) {
    const [y, m] = sp.m.split("-").map(Number);
    cursor = new Date(y, m - 1, 1);
  } else {
    cursor = startOfMonth(today);
  }

  const monthStart = startOfMonth(cursor);
  const monthEnd = addMonths(monthStart, 1);

  const briefs = await db
    .select()
    .from(contentBriefs)
    .where(
      and(
        eq(contentBriefs.clientId, clientId),
        gte(contentBriefs.createdAt, monthStart),
        lt(contentBriefs.createdAt, monthEnd),
      ),
    )
    .orderBy(asc(contentBriefs.createdAt));

  const byDay = new Map<string, ContentBrief[]>();
  for (const b of briefs) {
    const key = ymd(b.createdAt);
    const list = byDay.get(key) ?? [];
    list.push(b);
    byDay.set(key, list);
  }

  // Build calendar grid — start on Sunday before monthStart
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }
  // Trim trailing week if entirely outside the month
  while (
    cells.length > 35 &&
    cells[cells.length - 7].getMonth() !== monthStart.getMonth()
  ) {
    cells.length -= 7;
  }

  const prevM = ymd(addMonths(monthStart, -1)).slice(0, 7);
  const nextM = ymd(addMonths(monthStart, 1)).slice(0, 7);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/content/c"
        toolLabel="Content calendar"
        icon={CalendarDays}
      />

      <PageHeader
        title={`Content calendar · ${client.name}`}
        description="Editorial calendar built from your content briefs. Briefs land on the day they were created — drill in to update status or generate a draft."
        icon={CalendarDays}
        accent="violet"
        actions={
          <Link
            href={`/content/c/${clientId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-violet-500/30 ring-1 ring-inset ring-white/15 transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            New brief
          </Link>
        }
      />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Link
              href={`/content/c/${clientId}/calendar?m=${prevM}`}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <h2 className="min-w-[180px] text-center text-base font-semibold">
              {monthLabel.format(monthStart)}
            </h2>
            <Link
              href={`/content/c/${clientId}/calendar?m=${nextM}`}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href={`/content/c/${clientId}/calendar?m=${ymd(startOfMonth(today)).slice(0, 7)}`}
              className="rounded-md bg-white/5 px-2.5 py-1 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
            >
              Today
            </Link>
            <Link
              href={`/content/c/${clientId}`}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2.5 py-1 ring-1 ring-inset ring-white/10 transition-colors hover:bg-white/10"
            >
              <FileText className="size-3" />
              List view
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-7 border-b border-white/[0.06] bg-white/[0.02] text-[11px] uppercase tracking-wider text-muted-foreground">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="px-2 py-2 text-center font-medium">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const inMonth = d.getMonth() === monthStart.getMonth();
            const isToday = ymd(d) === ymd(today);
            const dayBriefs = byDay.get(ymd(d)) ?? [];
            return (
              <div
                key={i}
                className={`min-h-[110px] border-b border-r border-white/[0.04] p-1.5 last:border-r-0 ${
                  inMonth ? "" : "bg-white/[0.01] opacity-50"
                }`}
              >
                <div
                  className={`mb-1 flex items-center justify-between text-[11px] ${
                    isToday
                      ? "font-bold text-violet-300"
                      : "text-muted-foreground"
                  }`}
                >
                  <span>{d.getDate()}</span>
                  {dayBriefs.length > 0 && (
                    <span className="rounded-full bg-white/5 px-1.5 text-[9px] ring-1 ring-inset ring-white/10">
                      {dayBriefs.length}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayBriefs.slice(0, 3).map((b) => (
                    <Link
                      key={b.id}
                      href={`/content/c/${clientId}#brief-${b.id}`}
                      className={`block truncate rounded-md px-1.5 py-0.5 text-[10.5px] ring-1 ring-inset transition-colors hover:brightness-110 ${statusTone[b.status]}`}
                      title={`${b.title} · ${b.status}`}
                    >
                      {b.title}
                    </Link>
                  ))}
                  {dayBriefs.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{dayBriefs.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {briefs.filter((b) => b.publishedUrl).length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
          <h2 className="text-base font-semibold">
            Published this month ({briefs.filter((b) => b.publishedUrl).length})
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {briefs
              .filter((b) => b.publishedUrl)
              .map((b) => (
                <li key={b.id} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                  <a
                    href={b.publishedUrl ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate hover:underline"
                  >
                    {b.title}
                  </a>
                  <ExternalLink className="size-3 text-muted-foreground" />
                </li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
