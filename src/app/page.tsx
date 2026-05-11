import { db } from "@/db/client";
import { audits, clients, tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

import { count, desc, eq, ne } from "drizzle-orm";
import {
  ArrowUpRight,
  Bot,
  ClipboardList,
  FileDown,
  Link2,
  ListChecks,
  Search,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { AreaChart } from "@/components/ui/area-chart";
import Link from "next/link";
import { PortfolioTrafficPanel } from "./portfolio-traffic-panel";
import { PortfolioQuickWinsPanel } from "./portfolio-quick-wins-panel";
import { MorningBriefing } from "./morning-briefing";
import { AgencyWeekInReview } from "./agency-week";
import { WelcomeTour } from "./welcome-tour";
import { OnboardingChecklistPanel } from "./onboarding-checklist-panel";
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

  // Wider window for the trend chart — 30 most recent completed audits
  // (across clients) so the line has enough points to be meaningful.
  const trendAudits = await db
    .select({
      score: audits.score,
      completedAt: audits.completedAt,
      createdAt: audits.createdAt,
    })
    .from(audits)
    .where(eq(audits.status, "completed"))
    .orderBy(desc(audits.createdAt))
    .limit(30);

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
    <div className="mx-auto max-w-7xl space-y-6">
      {/* HERO — wrapped in a card for visual containment. Shows fresh
          welcome or returning-user greeting. Returning users also see
          a latest-audit summary card on the right. */}
      <section className="grid gap-6 rounded-xl border border-border bg-card p-6 shadow lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Local · single-user · everything on this machine
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
            {isFresh
              ? "Welcome. Let's set up your first 5 minutes."
              : `${greeting}, here's what needs attention today.`}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isFresh
              ? "100+ SEO tools, daily-agent automation, audits, rank tracking, content writer, code generator — fully self-hosted, no monthly bill. Connect any AI provider and add your first client to unlock everything."
              : "Free, modern, beginner-friendly SEO for freelancers and small agencies — without the $140/mo SaaS bills."}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isFresh ? (
              <>
                <Link href="/settings#ai" className={buttonVariants()}>
                  Connect an AI provider
                </Link>
                <Link
                  href="/clients/new"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Or add a client first
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </>
            ) : (
              <>
                <Link href="/clients/new" className={buttonVariants()}>
                  Add a client
                </Link>
                <Link
                  href="/clients"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  View clients
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>

        {!isFresh && (
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <ScoreGauge score={latestScore} />
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Latest audit
              </div>
              <div className="text-sm font-medium text-foreground">
                {recentAudits[0]?.clientName ?? "—"}
              </div>
              {scoreDelta !== null ? (
                <div
                  className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
                    scoreDelta > 0
                      ? "text-emerald-300"
                      : scoreDelta < 0
                        ? "text-rose-300"
                        : "text-muted-foreground"
                    }`}
                  >
                    {scoreDelta > 0 ? "+" : ""}
                    {scoreDelta} vs previous
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    First measurement
                  </div>
                )}
              </div>
            </div>
          )}
      </section>

      {/* STATS — hidden on fresh state (all-zero cards look bad).
          Returning users see a clean 4-column row of 4 cards. */}
      {!isFresh && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            className="animate-page-enter stagger-1"
            label="Open tasks"
            value={openTaskCount}
            accent="violet"
            icon={ListChecks}
            hint={
              openTaskCount > 0 ? "Sorted by priority below" : "All caught up"
            }
            spark={issueTimeline.length > 1 ? issueTimeline : undefined}
          />
          <StatCard
            className="animate-page-enter stagger-2"
            label="Clients"
            value={clientCount}
            accent="cyan"
            icon={Users}
            hint="Active"
          />
          <StatCard
            className="animate-page-enter stagger-3"
            label="Audits run"
            value={auditCount}
            accent="amber"
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
          <StatCard
            className="animate-page-enter stagger-4"
            label="Latest score"
            value={latestScore ?? "—"}
            accent="emerald"
            icon={Sparkles}
            hint={
              completedAudits.length > 0
                ? `${completedAudits.length} completed`
                : "Run an audit first"
            }
            delta={
              scoreDelta !== null
                ? { value: scoreDelta, label: "vs previous" }
                : undefined
            }
          />
        </div>
      )}

      {/* ONBOARDING CHECKLIST — persistent progress; auto-hides when done */}
      <Suspense fallback={null}>
        <OnboardingChecklistPanel />
      </Suspense>

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
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="max-w-xl space-y-2">
            <div className="text-[11px] font-medium text-primary">
              First steps
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Add your first client to get started
            </h2>
            <p className="text-[13px] text-muted-foreground">
              We&apos;ll detect the tech stack, generate an actionable task list
              based on the niche you pick, and run a first audit on demand. No
              API keys needed.
            </p>
            <div className="pt-2">
              <Link href="/clients/new" className={buttonVariants()}>
                Add a client
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          {priorityTasks.length > 0 && (
            <section className="rounded-lg border border-border bg-card lg:col-span-3">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <Sparkles className="size-3.5 text-violet-300" />
                    Priority tasks
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Auto-generated from audits and niche templates
                  </p>
                </div>
                <Link
                  href="/tasks"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  View all
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="divide-y divide-border">
                {priorityTasks.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-start justify-between gap-4 px-4 py-2.5 transition-colors hover:bg-accent"
                  >
                    <div className="space-y-0.5">
                      <div className="text-[13px] font-medium leading-snug text-foreground">
                        {t.title}
                      </div>
                      {t.clientName && t.clientId && (
                        <Link
                          href={`/clients/${t.clientId}`}
                          className="text-[11px] text-muted-foreground hover:text-foreground hover:underline"
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
            <section className="rounded-lg border border-border bg-card lg:col-span-2">
              <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <div>
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <ClipboardList className="size-3.5 text-violet-300" />
                    Recent audits
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Last 5 across all clients
                  </p>
                </div>
                <Link
                  href="/clients"
                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  Clients
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="divide-y divide-border">
                {recentAudits.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <Link
                        href={`/audits/${a.id}`}
                        className="block truncate font-medium text-foreground hover:underline"
                      >
                        {a.clientName ?? `Client ${a.clientId}`}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
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

      {/* Score trend chart — shadcn-admin-style area chart of recent audits */}
      {!isFresh && trendAudits.length >= 2 && (
        <section className="rounded-xl border border-border bg-card p-6 shadow">
          <header className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Audit score trend
              </h2>
              <p className="text-sm text-muted-foreground">
                Last {trendAudits.length} completed audits across all clients.
              </p>
            </div>
          </header>
          <AreaChart
            data={[...trendAudits]
              .reverse()
              .map((a, i) => ({
                name: (a.completedAt ?? a.createdAt).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" },
                ),
                value: a.score ?? 0,
                _idx: i,
              }))}
            colorClass="text-violet-500"
            height={220}
            formatValue={(v) => `${Math.round(v)}`}
          />
        </section>
      )}

      {/* Bento quick-actions — one tile per workflow */}
      <BentoQuickActions />
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  let cls = "border-border bg-muted text-muted-foreground";
  if (score !== null) {
    if (score >= 80) cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    else if (score >= 50) cls = "border-amber-500/30 bg-amber-500/10 text-amber-300";
    else cls = "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }
  return (
    <span
      className={`inline-flex h-8 w-10 items-center justify-center rounded-md border text-[13px] font-semibold tabular-nums ${cls}`}
    >
      {score ?? "—"}
    </span>
  );
}

type BentoTile = {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  iconColor: string;
  /** Optional col / row span for the asymmetric Bento layout */
  className?: string;
};

const BENTO_TILES: BentoTile[] = [
  {
    href: "/audits",
    title: "Run an audit",
    desc: "30 SEO checks, severity-classified, AI-summarized.",
    icon: ClipboardList,
    iconColor: "text-violet-300",
    className: "md:col-span-2 md:row-span-2",
  },
  {
    href: "/keywords",
    title: "Track keywords",
    desc: "Daily ranks, free browser mode.",
    icon: Search,
    iconColor: "text-cyan-300",
  },
  {
    href: "/reports",
    title: "Generate report",
    desc: "PDF, white-label, AI summary.",
    icon: FileDown,
    iconColor: "text-amber-300",
  },
  {
    href: "/agent",
    title: "AI agent",
    desc: "Auto-detects issues + applies fixes via WP bridge.",
    icon: Bot,
    iconColor: "text-fuchsia-300",
    className: "md:col-span-2",
  },
  {
    href: "/backlinks",
    title: "Backlinks",
    desc: "GSC + Common Crawl, lost-link recovery.",
    icon: Link2,
    iconColor: "text-emerald-300",
  },
  {
    href: "/tools",
    title: "All tools",
    desc: "100+ tools in one searchable grid.",
    icon: Wrench,
    iconColor: "text-rose-300",
  },
];

function BentoQuickActions() {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quick actions
      </h2>
      <div className="grid auto-rows-[110px] grid-cols-2 gap-3 md:grid-cols-4">
        {BENTO_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className={`group relative flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent ${tile.className ?? ""}`}
            >
              <Icon className={`size-4 ${tile.iconColor}`} />
              <div>
                <div className="text-[13px] font-semibold text-foreground">
                  {tile.title}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {tile.desc}
                </div>
              </div>
              <ArrowUpRight className="absolute right-3 top-3 size-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
