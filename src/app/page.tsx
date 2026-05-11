import { db } from "@/db/client";
import { audits, clients, tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

import { count, desc, eq, ne } from "drizzle-orm";
import {
  ArrowUpRight,
  ClipboardList,
  ListChecks,
  Sparkles,
  Users,
} from "lucide-react";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { ScoreGauge } from "@/components/ui/score-gauge";
import Link from "next/link";
import { PortfolioTrafficPanel } from "./portfolio-traffic-panel";
import { PortfolioQuickWinsPanel } from "./portfolio-quick-wins-panel";
import { MorningBriefing } from "./morning-briefing";
import { AgencyWeekInReview } from "./agency-week";
import { WelcomeTour } from "./welcome-tour";
import {
  tickPageMonitorRunner,
  tickScheduleRunner,
} from "@/lib/report-mailer";
import { tickDailyAgent } from "@/lib/daily-agent";
import { tickWeeklyDigestRunner } from "@/lib/weekly-digest";

const priorityVariant: Record<
  string,
  "destructive" | "default" | "secondary" | "outline"
> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

function greetingForHour(hour: number) {
  if (hour < 5) return "Working late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  // Fire-and-forget schedulers — each has its own cooldown so they're
  // no-ops on most renders. Failures don't block the dashboard.
  tickScheduleRunner().catch(() => {});
  tickPageMonitorRunner().catch(() => {});
  tickDailyAgent().catch(() => {});
  tickWeeklyDigestRunner().catch(() => {});

  const [{ value: clientCount }] = await db
    .select({ value: count() })
    .from(clients);

  const [{ value: openTaskCount }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(ne(tasks.status, "done"));

  const [{ value: auditCount }] = await db
    .select({ value: count() })
    .from(audits);

  const recentAudits = await db
    .select({
      id: audits.id,
      score: audits.score,
      issuesCount: audits.issuesCount,
      status: audits.status,
      completedAt: audits.completedAt,
      createdAt: audits.createdAt,
      clientId: audits.clientId,
      clientName: clients.name,
    })
    .from(audits)
    .leftJoin(clients, eq(audits.clientId, clients.id))
    .orderBy(desc(audits.createdAt))
    .limit(5);

  const priorityTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      priority: tasks.priority,
      clientId: tasks.clientId,
      clientName: clients.name,
    })
    .from(tasks)
    .leftJoin(clients, eq(tasks.clientId, clients.id))
    .where(eq(tasks.status, "todo"))
    .orderBy(desc(tasks.createdAt))
    .limit(6);

  const isFresh = clientCount === 0;
  const greeting = greetingForHour(new Date().getHours());

  // Latest score across all completed audits (for hero gauge)
  const completedAudits = recentAudits.filter(
    (a) => a.status === "completed" && a.score !== null,
  );
  const latestScore = completedAudits[0]?.score ?? null;
  const previousScore = completedAudits[1]?.score ?? null;
  const scoreDelta =
    latestScore !== null && previousScore !== null
      ? latestScore - previousScore
      : null;

  // Build score timeline for sparkline
  const scoreTimeline = completedAudits
    .map((a) => a.score!)
    .reverse();

  // Issue trend (placeholder pattern derived from real data)
  const issueTimeline = recentAudits
    .map((a) => a.issuesCount)
    .reverse();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* HERO */}
      <section className="glass-apple-strong animate-page-enter relative overflow-hidden rounded-3xl p-8">
        {/* decorative orbs — restrained, brand-led */}
        <div className="pointer-events-none absolute -left-24 -top-24 size-80 rounded-full bg-violet-500/40 blur-[100px]" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 size-72 rounded-full bg-violet-600/20 blur-[100px] animate-float" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              Local · single-user · everything runs on this machine
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              {isFresh ? (
                <>
                  <span className="text-foreground">Welcome.</span>{" "}
                  <span className="text-gradient-brand">
                    Let&apos;s set up your first 5 minutes.
                  </span>
                </>
              ) : (
                <>
                  <span className="text-foreground">{greeting}.</span>{" "}
                  <span className="text-gradient-brand">
                    Here&apos;s what needs attention today.
                  </span>
                </>
              )}
            </h1>
            <p className="max-w-xl text-base text-muted-foreground">
              {isFresh
                ? "100+ SEO tools, daily-agent automation, audits, rank tracking, content writer, code generator — fully self-hosted, fully yours. Pick an AI provider (free Ollama or any API key) and add your first client to unlock everything."
                : "Free, modern, beginner-friendly SEO for freelancers and small agencies — without the $140/mo SaaS bills."}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {isFresh ? (
                <>
                  <Link
                    href="/settings#ai"
                    className={buttonVariants({
                      className:
                        "shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15",
                    })}
                  >
                    Connect an AI provider
                  </Link>
                  <Link
                    href="/clients/new"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    Or add a client first
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    href="/clients/new"
                    className={buttonVariants({
                      className:
                        "shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15",
                    })}
                  >
                    Add a client
                  </Link>
                  <Link
                    href="/clients"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    View clients
                    <ArrowUpRight className="size-3.5" />
                  </Link>
                </>
              )}
            </div>
          </div>

          {!isFresh && (
            <div className="glass-apple relative flex items-center gap-6 rounded-2xl p-6">
              <ScoreGauge score={latestScore} />
              <div className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Latest audit
                </div>
                <div className="text-base font-medium">
                  {recentAudits[0]?.clientName ?? "—"}
                </div>
                {scoreDelta !== null ? (
                  <div
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                      scoreDelta > 0
                        ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                        : scoreDelta < 0
                          ? "bg-rose-500/10 text-rose-400 ring-rose-500/20"
                          : "bg-muted text-muted-foreground ring-border"
                    }`}
                  >
                    {scoreDelta > 0 ? "+" : ""}
                    {scoreDelta} vs previous
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    First measurement
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* STATS — intentional asymmetry: open tasks is the "do today" anchor */}
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard
          className="animate-page-enter stagger-1 lg:col-span-2"
          size="hero"
          label="Open tasks"
          value={openTaskCount}
          accent="violet"
          icon={ListChecks}
          hint={openTaskCount > 0 ? "Sorted by priority below" : "All caught up"}
          spark={issueTimeline.length > 1 ? issueTimeline : undefined}
        />
        <StatCard
          className="animate-page-enter stagger-2"
          size="compact"
          label="Clients"
          value={clientCount}
          accent="violet"
          icon={Users}
          hint={isFresh ? "Add your first" : "Active"}
        />
        <StatCard
          className="animate-page-enter stagger-3"
          size="compact"
          label="Audits run"
          value={auditCount}
          accent="violet"
          icon={ClipboardList}
          hint={
            scoreDelta !== null
              ? `Score ${latestScore} (${scoreDelta > 0 ? "+" : ""}${scoreDelta})`
              : completedAudits.length > 0
                ? `Latest ${latestScore}`
                : "Run your first"
          }
          spark={scoreTimeline.length > 1 ? scoreTimeline : undefined}
        />
      </div>

      {/* WELCOME TOUR — guides first-run users through the workflow */}
      {isFresh && <WelcomeTour />}

      {/* MORNING BRIEFING — what changed in last 24h across portfolio */}
      {!isFresh && (
        <Suspense fallback={null}>
          <MorningBriefing />
        </Suspense>
      )}

      {/* AGENCY WEEK IN REVIEW — aggregate activity across all clients */}
      {!isFresh && (
        <Suspense fallback={null}>
          <AgencyWeekInReview />
        </Suspense>
      )}

      {/* REAL GOOGLE DATA — only renders if any client has Google linked */}
      <Suspense fallback={null}>
        <PortfolioTrafficPanel />
      </Suspense>
      <Suspense fallback={null}>
        <PortfolioQuickWinsPanel />
      </Suspense>

      {/* GETTING STARTED OR DETAIL PANELS */}
      {isFresh ? (
        <section className="glass-apple animate-page-enter stagger-4 relative overflow-hidden rounded-2xl p-8">
          <div className="pointer-events-none absolute right-10 top-1/2 size-48 -translate-y-1/2 rounded-full bg-gradient-to-br from-violet-500/20 to-cyan-500/10 blur-2xl" />
          <div className="relative max-w-xl space-y-3">
            <div className="text-xs font-medium uppercase tracking-wider text-primary">
              First steps
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Add your first client to get started
            </h2>
            <p className="text-sm text-muted-foreground">
              We&apos;ll detect the tech stack, generate an actionable task list
              based on the niche you pick, and run a first audit on demand. No
              API keys needed.
            </p>
            <div className="pt-2">
              <Link
                href="/clients/new"
                className={buttonVariants({
                  className: "shadow-md shadow-violet-500/25",
                })}
              >
                Add a client
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          {priorityTasks.length > 0 && (
            <section className="glass-apple animate-page-enter stagger-4 relative overflow-hidden rounded-2xl lg:col-span-3">
              <div className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-violet-500/12 blur-3xl" />
              <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Sparkles className="size-4 text-violet-300" />
                    Priority tasks
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Auto-generated from audits and niche templates
                  </p>
                </div>
                <Link
                  href="/tasks"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  View all
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="relative divide-y divide-white/5">
                {priorityTasks.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-start justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium leading-snug">
                        {t.title}
                      </div>
                      {t.clientName && t.clientId && (
                        <Link
                          href={`/clients/${t.clientId}`}
                          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {t.clientName}
                        </Link>
                      )}
                    </div>
                    <Badge
                      variant={priorityVariant[t.priority]}
                      className="shrink-0 capitalize"
                    >
                      {t.priority}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recentAudits.length > 0 && (
            <section className="glass-apple animate-page-enter stagger-5 relative overflow-hidden rounded-2xl lg:col-span-2">
              <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-violet-500/10 blur-3xl" />
              <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <ClipboardList className="size-4 text-violet-300" />
                    Recent audits
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last 5 across all clients
                  </p>
                </div>
                <Link
                  href="/clients"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                >
                  Clients
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="relative divide-y divide-white/5">
                {recentAudits.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-white/[0.03]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <Link
                        href={`/audits/${a.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {a.clientName ?? `Client ${a.clientId}`}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {(a.completedAt ?? a.createdAt).toLocaleDateString()} ·{" "}
                        {a.issuesCount} issues
                      </div>
                    </div>
                    <ScoreBadge score={a.score} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  let tone = "bg-muted/40 text-muted-foreground ring-border";
  let textTone = "";
  if (score !== null) {
    if (score >= 80) {
      tone = "bg-emerald-500/10 ring-emerald-500/30";
      textTone = "text-gradient-emerald";
    } else if (score >= 50) {
      tone = "bg-amber-500/10 ring-amber-500/30";
      textTone = "text-gradient-amber";
    } else {
      tone = "bg-rose-500/10 ring-rose-500/30";
      textTone = "text-gradient-rose";
    }
  }
  return (
    <span
      className={`inline-flex h-10 w-12 items-center justify-center rounded-xl text-base font-bold ring-1 ring-inset ${tone} ${textTone}`}
    >
      {score ?? "—"}
    </span>
  );
}
