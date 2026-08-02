export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Gauge } from "lucide-react";
import { db } from "@/db/client";
import { clients, cwvReports } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";

type SearchParams = { client?: string };

export default async function CwvArchivePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const clientFilter = sp.client ? Number(sp.client) : null;

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(clients.name);

  let q = db
    .select({
      id: cwvReports.id,
      url: cwvReports.url,
      strategy: cwvReports.strategy,
      performance: cwvReports.performance,
      lcpMs: cwvReports.lcpMs,
      inpMs: cwvReports.inpMs,
      cls: cwvReports.cls,
      overall: cwvReports.overall,
      scannedAt: cwvReports.scannedAt,
      clientName: clients.name,
      clientId: cwvReports.clientId,
    })
    .from(cwvReports)
    .leftJoin(clients, eq(cwvReports.clientId, clients.id))
    .$dynamic();
  if (clientFilter !== null)
    q = q.where(eq(cwvReports.clientId, clientFilter));
  const reports = await q.orderBy(desc(cwvReports.scannedAt)).limit(200);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Core Web Vitals archive"
        description="Every PSI scan you've run, persisted. Filter by client. Click any row to re-scan the URL or view the full report."
        icon={Gauge}
        accent="cyan"
        meta={
          <span className="text-xs text-muted-foreground">
            {reports.length} scans
          </span>
        }
      />

      <section className="rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/cwv/archive"
            className={pill(clientFilter === null)}
          >
            All clients
          </Link>
          {allClients.map((c) => (
            <Link
              key={c.id}
              href={`/cwv/archive?client=${c.id}`}
              className={pill(clientFilter === c.id)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {reports.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No scans yet. Run a scan from{" "}
          <Link href="/cwv" className="text-violet-300 hover:underline">
            /cwv
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
            >
              <span
                className={`inline-flex h-7 w-12 items-center justify-center rounded-md text-xs font-bold ring-1 ring-inset ${
                  r.overall === "pass"
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                    : r.overall === "needs_improvement"
                      ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                      : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                }`}
              >
                {r.performance ?? "?"}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate font-medium">
                  {r.url.replace(/^https?:\/\//, "")}
                </p>
                <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{r.strategy}</span>
                  <span>
                    LCP {r.lcpMs ?? "?"}ms · INP {r.inpMs ?? "?"}ms · CLS{" "}
                    {r.cls !== null ? (r.cls / 100).toFixed(3) : "?"}
                  </span>
                  <span>{new Date(r.scannedAt).toLocaleString()}</span>
                  {r.clientName && <span>· {r.clientName}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pill(active: boolean): string {
  return `rounded-full px-2.5 py-1 ring-1 ring-inset transition-colors ${
    active
      ? "bg-violet-500/15 text-violet-300 ring-violet-500/30"
      : "bg-white/5 text-muted-foreground ring-white/10 hover:bg-white/10"
  }`;
}
