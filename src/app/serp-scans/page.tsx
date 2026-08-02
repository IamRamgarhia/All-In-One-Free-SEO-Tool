export const dynamic = "force-dynamic";

import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Globe } from "lucide-react";
import { db } from "@/db/client";
import { keywords, serpScans, clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { clientScope } from "@/lib/client-scope";

type SearchParams = { client?: string };

export default async function SerpScansPage({
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
      id: serpScans.id,
      query: keywords.query,
      ok: serpScans.ok,
      aiOverviewPresent: serpScans.aiOverviewPresent,
      localPackPresent: serpScans.localPackPresent,
      paaQuestions: serpScans.paaQuestions,
      featuredSnippet: serpScans.featuredSnippet,
      scannedAt: serpScans.scannedAt,
      clientId: keywords.clientId,
      clientName: clients.name,
    })
    .from(serpScans)
    .leftJoin(keywords, eq(serpScans.keywordId, keywords.id))
    .leftJoin(clients, eq(keywords.clientId, clients.id))
    .$dynamic();
  if (clientFilter !== null) q = q.where(eq(keywords.clientId, clientFilter));
  const scans = await q.orderBy(desc(serpScans.scannedAt)).limit(200);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="SERP scans archive"
        description="Every SERP scan with AI Overview presence, featured snippets, People Also Ask, and local pack. Filter by client."
        icon={Globe}
        accent="amber"
        meta={
          <span className="text-xs text-muted-foreground">
            {scans.length} scans
          </span>
        }
      />

      <section className="rounded-2xl border border-white/5 bg-card/40 p-3 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Link
            href="/serp-scans"
            className={pill(clientFilter === null)}
          >
            All clients
          </Link>
          {allClients.map((c) => (
            <Link
              key={c.id}
              href={`/serp-scans?client=${c.id}`}
              className={pill(clientFilter === c.id)}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {scans.length === 0 ? (
        <p className="rounded-2xl border border-white/5 bg-card/40 px-5 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          No SERP scans yet. Track keywords on{" "}
          <Link href="/keywords" className="text-violet-300 hover:underline">
            /keywords
          </Link>
          — daily scans populate this archive.
        </p>
      ) : (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          {scans.map((s) => (
            <li
              key={s.id}
              className="space-y-1 px-5 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.query ?? "(deleted keyword)"}</span>
                {s.clientName && (
                  <span className="text-[11px] text-muted-foreground">
                    · {s.clientName}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {new Date(s.scannedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                {s.aiOverviewPresent && (
                  <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-violet-300 ring-1 ring-inset ring-violet-500/30">
                    AI Overview
                  </span>
                )}
                {s.featuredSnippet && (
                  <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    Featured snippet
                  </span>
                )}
                {s.localPackPresent && (
                  <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-amber-300 ring-1 ring-inset ring-amber-500/30">
                    Local pack
                  </span>
                )}
                {Array.isArray(s.paaQuestions) && s.paaQuestions.length > 0 && (
                  <span className="rounded-md bg-cyan-500/15 px-1.5 py-0.5 text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                    {s.paaQuestions.length} PAA
                  </span>
                )}
                {!s.ok && (
                  <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-rose-300 ring-1 ring-inset ring-rose-500/30">
                    failed
                  </span>
                )}
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
