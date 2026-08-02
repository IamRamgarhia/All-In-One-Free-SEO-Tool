export const dynamic = "force-dynamic";

import Link from "next/link";
import { asc } from "drizzle-orm";
import { Calendar } from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";
import { fetchCalendarBriefs } from "./actions";
import { CalendarClient } from "./client";

type SearchParams = {
  client?: string;
  month?: string; // YYYY-MM
};

export default async function ContentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const clientId = sp.client ? Number(sp.client) : null;

  const now = new Date();
  const [yStr, mStr] = (sp.month ?? "").split("-");
  const year = Number(yStr) || now.getFullYear();
  const monthIdx = (Number(mStr) || now.getMonth() + 1) - 1;
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 0, 23, 59, 59);

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  // Widen by a few days each side so the calendar grid (which always has
  // 5-6 weeks) can show overflow days
  const padFrom = new Date(monthStart);
  padFrom.setDate(monthStart.getDate() - 7);
  const padTo = new Date(monthEnd);
  padTo.setDate(monthEnd.getDate() + 7);

  const briefs = await fetchCalendarBriefs({
    clientId,
    from: padFrom,
    to: padTo,
  });

  const monthLabel = monthStart.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const prevMonth = new Date(year, monthIdx - 1, 1);
  const nextMonth = new Date(year, monthIdx + 1, 1);
  const fmtMonth = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const buildHref = (m: string) => {
    const params = new URLSearchParams();
    params.set("month", m);
    if (clientId !== null) params.set("client", String(clientId));
    return `/content/calendar?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Content calendar"
        description="Month-view of every content brief tied to a date — ideas, drafts in flight, scheduled posts, and published pieces. Click any cell to reschedule a brief."
        icon={Calendar}
        accent="violet"
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Link
              href={buildHref(fmtMonth(prevMonth))}
              className="rounded-md bg-white/5 px-2 py-1 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
            >
              ← Prev
            </Link>
            <span className="font-medium">{monthLabel}</span>
            <Link
              href={buildHref(fmtMonth(nextMonth))}
              className="rounded-md bg-white/5 px-2 py-1 text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
            >
              Next →
            </Link>
            <Link
              href={buildHref(fmtMonth(now))}
              className="rounded-md bg-violet-500/10 px-2 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/20"
            >
              Today
            </Link>
          </div>
        }
      />

      <section className="rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Client filter
          </span>
          <Link
            href={(() => {
              const p = new URLSearchParams();
              p.set("month", fmtMonth(monthStart));
              return `/content/calendar?${p.toString()}`;
            })()}
            className={pillClass(clientId === null)}
          >
            All
          </Link>
          {allClients.map((c) => {
            const p = new URLSearchParams();
            p.set("month", fmtMonth(monthStart));
            p.set("client", String(c.id));
            return (
              <Link
                key={c.id}
                href={`/content/calendar?${p.toString()}`}
                className={pillClass(clientId === c.id)}
              >
                {c.name}
              </Link>
            );
          })}
        </div>
      </section>

      <CalendarClient
        monthStart={monthStart}
        monthEnd={monthEnd}
        briefs={briefs.map((b) => ({
          id: b.id,
          clientId: b.clientId,
          title: b.title,
          status: b.status,
          targetKeyword: b.targetKeyword,
          scheduledFor: b.scheduledFor?.toISOString() ?? null,
          updatedAt: b.updatedAt.toISOString(),
          publishedUrl: b.publishedUrl,
        }))}
        clients={allClients}
      />
    </div>
  );
}

function pillClass(active: boolean): string {
  return `rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}
