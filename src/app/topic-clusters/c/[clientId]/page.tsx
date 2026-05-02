export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq, asc, inArray, desc } from "drizzle-orm";
import { Layers } from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { clusterKeywords } from "@/lib/keyword-cluster";

export default async function PerClientTopicClustersPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
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
    .orderBy(asc(clients.name));

  const tracked = await db
    .select()
    .from(keywords)
    .where(eq(keywords.clientId, clientId))
    .orderBy(desc(keywords.createdAt));

  // Latest position per keyword
  const ranks =
    tracked.length === 0
      ? []
      : await db
          .select()
          .from(keywordRankings)
          .where(
            inArray(
              keywordRankings.keywordId,
              tracked.map((t) => t.id),
            ),
          )
          .orderBy(keywordRankings.checkedAt);

  const latestRankByKw = new Map<number, number | null>();
  for (const r of ranks) {
    latestRankByKw.set(r.keywordId, r.position);
  }

  const { clusters, ungrouped } = clusterKeywords(
    tracked.map((t) => ({ id: t.id, query: t.query, kw: t })),
  );

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
        basePath="/topic-clusters/c"
        toolLabel="Topic clusters"
        icon={Layers}
      />

      <PageHeader
        title={`Topic clusters · ${client.name}`}
        description="Tracked keywords grouped by shared meaningful tokens. The biggest cluster usually maps to your strongest pillar topic — supporting clusters become internal-linking opportunities."
        icon={Layers}
        accent="violet"
      />

      {tracked.length < 3 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Track at least 3-5 keywords to see meaningful clusters.{" "}
            <a
              href={`/keywords/c/${clientId}`}
              className="text-violet-300 hover:underline"
            >
              Add keywords →
            </a>
          </p>
        </div>
      ) : clusters.length === 0 ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            No shared topics found across these keywords yet.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {clusters.map((c) => (
              <ClusterCard
                key={c.topic}
                topic={c.topic}
                keywords={c.keywords.map((k) => ({
                  id: k.id,
                  query: k.query,
                  position: latestRankByKw.get(k.id) ?? null,
                }))}
              />
            ))}
          </div>

          {ungrouped.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="text-base font-semibold">Ungrouped</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Keywords that don&apos;t cluster with others. Could mean
                  isolated topics or just too few related queries tracked yet.
                </p>
              </header>
              <ul className="flex flex-wrap gap-1.5 p-5">
                {ungrouped.map((k) => (
                  <li
                    key={k.id}
                    className="rounded-full bg-white/5 px-2.5 py-1 text-xs ring-1 ring-inset ring-white/10"
                  >
                    {k.query}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ClusterCard({
  topic,
  keywords,
}: {
  topic: string;
  keywords: { id: number; query: string; position: number | null }[];
}) {
  const sortedByPos = [...keywords].sort((a, b) => {
    if (a.position === null && b.position === null) return 0;
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  });
  const pillar = sortedByPos[0];
  const supporting = sortedByPos.slice(1);

  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <span className="rounded-md bg-violet-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase text-violet-300 ring-1 ring-inset ring-violet-500/30">
          {topic}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {keywords.length} keyword{keywords.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="space-y-2 p-4">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300/90">
            Pillar
          </div>
          <div className="mt-0.5 flex items-center justify-between">
            <span className="text-sm font-medium">{pillar.query}</span>
            {pillar.position && (
              <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold text-emerald-300 tabular-nums">
                #{pillar.position}
              </span>
            )}
          </div>
        </div>
        {supporting.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Supporting
            </div>
            <ul className="space-y-1">
              {supporting.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between rounded-md bg-white/[0.02] px-2.5 py-1.5 text-xs"
                >
                  <span>{k.query}</span>
                  {k.position && (
                    <span className="text-muted-foreground tabular-nums">
                      #{k.position}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
