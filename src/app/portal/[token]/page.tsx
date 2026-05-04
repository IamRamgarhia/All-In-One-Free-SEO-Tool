import { notFound } from "next/navigation";
import { eq, desc, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  CheckCircle2,
  ListChecks,
  Sparkles,
  ClipboardList,
  Globe,
  Activity,
} from "lucide-react";
import { db } from "@/db/client";
import { audits, clients, tasks } from "@/db/schema";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { getSetting } from "@/lib/settings-store";
import { SnapshotSparklines } from "@/components/snapshot-sparklines";

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!token || token.length < 16) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.shareToken, token))
    .limit(1);
  if (!client) notFound();

  const recentAudits = await db
    .select()
    .from(audits)
    .where(eq(audits.clientId, client.id))
    .orderBy(desc(audits.createdAt))
    .limit(6);

  const [latest] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, client.id), eq(audits.status, "completed")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  const allTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.clientId, client.id));

  const open = allTasks.filter((t) => t.status !== "done");
  const done = allTasks.filter((t) => t.status === "done");
  const recentDone = [...done]
    .sort(
      (a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
    )
    .slice(0, 5);
  const upcoming = [...open]
    .sort(
      (a, b) =>
        (a.dueDate?.getTime() ?? Infinity) -
        (b.dueDate?.getTime() ?? Infinity),
    )
    .slice(0, 5);

  const brandName = await getSetting<string>("brand.name");
  const brandColor = await getSetting<string>("brand.color");
  const brandLogo = await getSetting<string>("brand.logo_data_url");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {/* Decorative background */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 70% 50% at 12% -5%, ${brandColor ?? "oklch(0.65 0.22 285 / 0.22)"}, transparent 65%), radial-gradient(ellipse 55% 45% at 90% 8%, oklch(0.74 0.18 200 / 0.14), transparent 70%)`,
        }}
      />

      <div className="relative mx-auto max-w-5xl space-y-8 px-6 py-10">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {brandLogo ? (
              <div className="rounded-lg bg-white/95 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={brandLogo}
                  alt={brandName ?? "Brand"}
                  className="h-8 max-w-[140px] object-contain"
                />
              </div>
            ) : (
              <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-indigo-600 text-sm font-bold text-white shadow-lg shadow-violet-500/40 ring-1 ring-inset ring-white/30">
                {(brandName ?? client.name).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Client portal
              </div>
              <div className="text-sm font-semibold">
                {brandName ?? "SEO tool"}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 text-xs text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
        </header>

        {/* Hero */}
        <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-violet-500/10 via-card/40 to-cyan-500/5 p-8 backdrop-blur-md">
          <div className="pointer-events-none absolute -left-20 -top-20 size-80 rounded-full bg-violet-500/30 blur-[100px]" />
          <div className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-cyan-500/20 blur-[100px]" />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                <span className="text-foreground">SEO progress for </span>
                <span className="text-gradient-brand">{client.name}</span>
              </h1>
              <p className="max-w-xl text-sm text-muted-foreground">
                Live overview of your SEO health, work in progress, and recently
                completed items. Updated whenever your team runs a new audit.
              </p>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                <Globe className="size-3 text-cyan-300" />
                <a
                  href={client.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  {client.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </div>
            </div>
            <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur">
              <ScoreGauge score={latest?.score ?? null} size={140} />
              <div className="space-y-1.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Latest score
                </div>
                <div className="text-sm font-medium">
                  {latest
                    ? latest.completedAt?.toLocaleDateString()
                    : "Awaiting audit"}
                </div>
                {latest && (
                  <div className="text-xs text-muted-foreground">
                    {latest.issuesCount} issues found
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Counters */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Counter
            icon={ClipboardList}
            label="Audits run"
            value={recentAudits.length}
            tone="cyan"
          />
          <Counter
            icon={ListChecks}
            label="Tasks open"
            value={open.length}
            tone="amber"
          />
          <Counter
            icon={CheckCircle2}
            label="Tasks completed"
            value={done.length}
            tone="emerald"
          />
        </div>

        {/* Recent done */}
        {recentDone.length > 0 && (
          <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
            <header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
                <CheckCircle2 className="size-4 text-emerald-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold">Recently completed</h2>
                <p className="text-xs text-muted-foreground">
                  Last 5 SEO tasks closed
                </p>
              </div>
            </header>
            <ul className="divide-y divide-white/5">
              {recentDone.map((t) => (
                <li key={t.id} className="px-5 py-3 text-sm">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <div className="space-y-0.5">
                      <div className="font-medium">{t.title}</div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      )}
                      {t.updatedAt && (
                        <div className="text-[10px] text-muted-foreground">
                          {t.updatedAt.toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
            <header className="flex items-center gap-3 border-b border-white/5 px-5 py-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-400/30">
                <Sparkles className="size-4 text-amber-300" />
              </div>
              <div>
                <h2 className="text-base font-semibold">In progress</h2>
                <p className="text-xs text-muted-foreground">
                  Top open tasks your team is working on
                </p>
              </div>
            </header>
            <ul className="divide-y divide-white/5">
              {upcoming.map((t) => (
                <li
                  key={t.id}
                  className="flex items-start gap-3 px-5 py-3 text-sm"
                >
                  <Activity className="mt-0.5 size-4 shrink-0 text-violet-300" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="font-medium">{t.title}</div>
                    {t.whyItMatters && (
                      <p className="text-xs text-muted-foreground">
                        {t.whyItMatters}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                      t.priority === "high"
                        ? "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                        : t.priority === "medium"
                          ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                          : "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30"
                    }`}
                  >
                    {t.priority}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Snapshot timeline — public-facing trends */}
        <SnapshotSparklines clientId={client.id} />

        {/* Audit history */}
        {recentAudits.length > 0 && (
          <section className="rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
            <header className="border-b border-white/5 px-5 py-4">
              <h2 className="text-base font-semibold">Audit history</h2>
            </header>
            <ul className="divide-y divide-white/5">
              {recentAudits.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium">Audit #{a.id}</div>
                    <div className="text-xs text-muted-foreground">
                      {(a.completedAt ?? a.createdAt).toLocaleDateString()} ·{" "}
                      {a.issuesCount} issues
                    </div>
                  </div>
                  <span
                    className={`inline-flex h-9 w-12 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ${
                      a.score === null
                        ? "bg-white/5 text-muted-foreground ring-white/10"
                        : a.score >= 80
                          ? "bg-emerald-500/10 ring-emerald-500/30 text-gradient-emerald"
                          : a.score >= 50
                            ? "bg-amber-500/10 ring-amber-500/30 text-gradient-amber"
                            : "bg-rose-500/10 ring-rose-500/30 text-gradient-rose"
                    }`}
                  >
                    {a.score ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="pb-6 pt-4 text-center text-[10px] text-muted-foreground">
          Read-only client portal · Powered by{" "}
          {brandName ? `${brandName} via SEO tool` : "SEO tool"}
        </footer>
      </div>
    </div>
  );
}

function Counter({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "cyan" | "amber" | "emerald";
}) {
  const m = {
    cyan: { bg: "bg-cyan-500/15 ring-cyan-400/30", text: "text-cyan-300", grad: "text-gradient-cyan" },
    amber: { bg: "bg-amber-500/15 ring-amber-400/30", text: "text-amber-300", grad: "text-gradient-amber" },
    emerald: { bg: "bg-emerald-500/15 ring-emerald-400/30", text: "text-emerald-300", grad: "text-gradient-emerald" },
  }[tone];
  return (
    <div className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <div className={`flex size-9 items-center justify-center rounded-xl ring-1 ${m.bg}`}>
          <Icon className={`size-4 ${m.text}`} />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
      </div>
      <div className={`mt-3 text-3xl font-bold tracking-tight ${m.grad}`}>
        {value}
      </div>
    </div>
  );
}
