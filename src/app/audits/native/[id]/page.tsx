import { notFound } from "next/navigation";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getNativeAudit } from "@/audit/storage/audit-repository";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { AUDIT_CATEGORIES } from "@/audit/engine/categories";

export const dynamic = "force-dynamic";

const catName = (id: string) =>
  AUDIT_CATEGORIES.find((c) => c.id === id)?.name ?? id;

export default async function NativeAuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const runId = Number(id);
  if (!Number.isFinite(runId)) notFound();

  const data = await getNativeAudit(runId);
  if (!data) notFound();
  const { run, issues } = data;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, run.clientId))
    .limit(1);
  if (!client) notFound();

  const categories = Object.entries(run.categoryScores ?? {}).sort(
    ([, a], [, b]) => a.score - b.score,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-2xl border border-white/5 bg-card/40 px-6 py-7 backdrop-blur-md">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/clients" className="hover:text-foreground">
            Clients
          </Link>
          <span>/</span>
          <Link
            href={`/clients/${client.id}`}
            className="hover:text-foreground"
          >
            {client.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Native audit #{run.id}</span>
        </nav>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
              <ClipboardList className="size-5 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Native technical audit
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Native engine (Waves 1–5) · mode {run.mode} ·{" "}
                {run.pagesCrawled ?? 0} page(s) · {run.issueCount} issue(s)
                {run.finishedAt
                  ? ` · ${run.finishedAt.toLocaleString()}`
                  : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-5">
            <ScoreGauge score={run.globalScore ?? null} size={120} />
            <div className="text-sm text-muted-foreground">
              {run.uncappedScore != null &&
              run.uncappedScore !== run.globalScore ? (
                <div>Uncapped {run.uncappedScore}</div>
              ) : null}
              {(run.scoreCaps ?? []).map((c) => (
                <div key={c.id} className="text-amber-200 text-xs mt-1">
                  Cap {c.ceiling}: {c.reason}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {categories.length > 0 ? (
        <section className="rounded-2xl border border-white/5 bg-card/40 px-5 py-4">
          <h2 className="text-sm font-semibold">Category scores</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map(([id, vals]) => (
              <div
                key={id}
                className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
              >
                <div className="flex justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {catName(id)}
                  </span>
                  <span className="font-semibold tabular-nums">{vals.score}</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {vals.pass} pass · {vals.warn} warn · {vals.fail} fail
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/5 bg-card/40 overflow-hidden">
        <header className="border-b border-white/5 px-5 py-4">
          <h2 className="text-base font-semibold">
            Issues ({issues.length})
          </h2>
        </header>
        {issues.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            No fail/warn issues in this run.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {issues.map((issue) => (
              <li key={issue.id} className="px-5 py-4 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{issue.title}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-muted-foreground ring-1 ring-inset ring-white/10">
                    {issue.severity}
                  </span>
                  <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-300 ring-1 ring-inset ring-violet-500/30">
                    {catName(issue.category)}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {issue.ruleId}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {issue.description}
                </p>
                {issue.recommendation ? (
                  <p className="text-xs text-cyan-100/90 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
                    <span className="font-semibold text-cyan-200">Fix: </span>
                    {issue.recommendation}
                  </p>
                ) : null}
                {(issue.affectedUrls ?? []).length > 0 ? (
                  <ul className="text-[11px] text-muted-foreground pl-3 border-l border-white/10">
                    {(issue.affectedUrls ?? []).slice(0, 8).map((u) => (
                      <li key={u} className="truncate">
                        <a href={u} className="hover:underline" target="_blank" rel="noreferrer">
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
