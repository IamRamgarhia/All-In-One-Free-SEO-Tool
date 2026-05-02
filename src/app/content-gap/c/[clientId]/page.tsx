export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import {
  AlertCircle,
  GitCompare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import { analyzeContentGap } from "@/app/content-gap/actions";

export default async function PerClientContentGapPage({
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

  const result = await analyzeContentGap({ clientId });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/content-gap/c"
        toolLabel="Content gap"
        icon={GitCompare}
      />

      <PageHeader
        title={`Content gap · ${client.name}`}
        description="Queries where this client is appearing in search but losing the click. Highest leverage content to refresh — Google already trusts you for these terms."
        icon={GitCompare}
        accent="cyan"
      />

      {!result.ok ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="mr-2 inline size-4" />
          {result.error}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile
              label="Total tracked queries"
              value={result.ourQueries.length}
              tone="violet"
            />
            <Tile
              label="Gap opportunities"
              value={result.gapKeywords.length}
              tone="rose"
              hint="Pos 4-30, ≥100 impr, <5% CTR"
            />
            <Tile
              label="Already winning"
              value={result.sharedKeywords.length}
              tone="emerald"
              hint="Top 3 with strong CTR"
            />
          </div>

          {result.gapKeywords.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Sparkles className="size-4 text-rose-300" />
                  Gap opportunities ({result.gapKeywords.length})
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Queries you appear for, but searchers aren&apos;t clicking
                  your result. Refresh the title/meta + improve the content
                  to capture impressions you&apos;re already getting.
                </p>
              </header>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-5 py-3 text-left font-medium">Query</th>
                    <th className="px-3 py-3 text-right font-medium">Impr.</th>
                    <th className="px-3 py-3 text-right font-medium">Clicks</th>
                    <th className="px-3 py-3 text-right font-medium">CTR</th>
                    <th className="px-3 py-3 text-right font-medium">Pos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {result.gapKeywords.slice(0, 50).map((k) => (
                    <tr key={k.query} className="hover:bg-white/[0.03]">
                      <td className="px-5 py-2 font-medium">{k.query}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {k.impressions.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {k.clicks}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-rose-300">
                        {(k.ctr * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-300">
                        {k.position.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {result.sharedKeywords.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-4">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <TrendingUp className="size-4 text-emerald-300" />
                  Already winning ({result.sharedKeywords.length})
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Don&apos;t change these pages — they&apos;re winning.
                  Reference for the kind of result you want everywhere.
                </p>
              </header>
              <ul className="divide-y divide-white/[0.04]">
                {result.sharedKeywords.map((k) => (
                  <li
                    key={k.query}
                    className="flex items-center justify-between gap-3 px-5 py-2 text-sm"
                  >
                    <span className="font-medium">{k.query}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-emerald-300 tabular-nums">
                        #{k.position.toFixed(1)}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {(k.ctr * 100).toFixed(1)}% CTR
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {k.clicks} clicks
                      </span>
                    </div>
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

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: "violet" | "emerald" | "rose";
  hint?: string;
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    rose: "text-gradient-rose",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
