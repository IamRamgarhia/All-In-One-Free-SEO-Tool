import { db } from "@/db/client";
import { taskTitle } from "@/lib/issue-display";
import { audits, clients, tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

import { and, count, desc, eq, gte, inArray, type AnyColumn } from "drizzle-orm";
import { scopedClientIds } from "@/lib/client-scope";
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
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { AreaChart } from "@/components/ui/area-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { FreshnessBadge } from "@/components/ui/freshness-badge";
import { MaintainerCredit } from "@/components/shell/maintainer-credit";
import Link from "next/link";
import { TaskToolLink } from "@/components/tools/task-tool-link";
import { taskPageUrl } from "@/lib/finding-tool-map";
import { PortfolioTrafficPanel } from "./portfolio-traffic-panel";
import { PortfolioQuickWinsPanel } from "./portfolio-quick-wins-panel";
import { MorningBriefing } from "./morning-briefing";
import { AgencyWeekInReview } from "./agency-week";
import { OnboardingChecklistPanel } from "./onboarding-checklist-panel";
import { AutonomyPrompt } from "./autonomy-prompt";
import { InstallHealthBanner } from "./install-health-banner";
import { PortfolioOverview } from "./portfolio-overview";
import { startScheduler, tickScheduler } from "@/lib/scheduler";
import { weeklyCounts } from "@/lib/portfolio";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/settings-store";

/**
 * The dashboard, in the upstream author's order and presentation:
 * greeting and latest-audit gauge, four counters with small trend lines,
 * what is wrong with the install and what the agent is holding, getting
 * started, the day's briefing, the agency week, priority tasks and recent
 * audits, then this fork's projects table, the score trend and the
 * quick actions.
 *
 * Every query is scoped: a member or a client viewer sees only the
 * projects assigned to them, and the agency-wide panels (install health,
 * autonomy, agency week, traffic) are for owners and managers only.
 */

const PRIORITY_TAG: Record<string, string> = {
  high: "gsk-tag gsk-tag--danger",
  medium: "gsk-tag gsk-tag--warning",
  low: "gsk-tag gsk-tag--default",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const t = await getTranslations("dashboard");
  const locale = await getLocale();
  const { vue } = await searchParams;

  function greetingForHour(hour: number) {
    if (hour < 5) return t("greetingLate");
    if (hour < 12) return t("greetingMorning");
    if (hour < 18) return t("greetingAfternoon");
    return t("greetingEvening");
  }

  // The background runners live in the scheduler (src/lib/scheduler.ts),
  // on a real interval. We still nudge it here: it costs nothing when
  // everything is current, and a just-restarted process catches up on
  // this render. try/catch AND .catch() because a synchronous throw
  // (native module fails to load) would otherwise 500 the dashboard, and
  // the dashboard must always render so people can see what is wrong.
  try {
    startScheduler();
    tickScheduler().catch(() => {});
  } catch {}

  // Members and client viewers see their assigned clients only.
  const scope = await scopedClientIds();
  const scoped = scope !== null;
  const inScope = (column: AnyColumn) =>
    scope === null
      ? undefined
      : inArray(column, scope.length > 0 ? scope : [-1]);

  const [{ value: clientCount }] = await db
    .select({ value: count() })
    .from(clients)
    .where(inScope(clients.id));

  // "Fresh" means a new workspace, not a member with no assignments yet.
  const isFresh = clientCount === 0 && !scoped;

  // First-run gate: a genuinely fresh workspace lands on /welcome until
  // it is dismissed.
  if (isFresh) {
    const dismissedAt = await getSetting<string>("onboarding.dismissed_at").catch(() => null);
    if (!dismissedAt) {
      redirect("/welcome");
    }
  }

  const now = new Date();
  const eightWeeksAgo = new Date(now.getTime() - 63 * 86_400_000);

  // Site audits only: the score of an AI review or another kind of audit
  // is not on the same scale, and mixing them made the gauge jump.
  const crawler = eq(audits.kind, "crawler");

  const [
    [{ value: openTaskCount }],
    [{ value: auditCount }],
    recentAudits,
    trendAudits,
    priorityTasks,
    doneRows,
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(tasks)
      .where(and(inArray(tasks.status, ["todo", "in_progress"]), inScope(tasks.clientId))),
    db
      .select({ value: count() })
      .from(audits)
      .where(and(crawler, inScope(audits.clientId))),
    db
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
      .where(and(crawler, inScope(audits.clientId)))
      .orderBy(desc(audits.createdAt))
      .limit(5),
    // The 30 most recent completed audits with a score. A completed audit
    // without one is left out rather than drawn as 0 — a dive to the floor
    // of the chart that reads as a site that collapsed (upstream's fix).
    db
      .select({
        score: audits.score,
        completedAt: audits.completedAt,
        createdAt: audits.createdAt,
        clientId: audits.clientId,
        clientName: clients.name,
      })
      .from(audits)
      .leftJoin(clients, eq(audits.clientId, clients.id))
      .where(and(crawler, eq(audits.status, "completed"), inScope(audits.clientId)))
      .orderBy(desc(audits.createdAt))
      .limit(30)
      .then((rows) =>
        rows.filter((r): r is typeof r & { score: number } => r.score !== null),
      ),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        toolPath: tasks.toolPath,
        sourceRef: tasks.sourceRef,
        pages: tasks.pages,
        clientId: tasks.clientId,
        clientName: clients.name,
        clientUrl: clients.url,
      })
      .from(tasks)
      .leftJoin(clients, eq(tasks.clientId, clients.id))
      .where(and(eq(tasks.status, "todo"), inScope(tasks.clientId)))
      .orderBy(desc(tasks.createdAt))
      .limit(6),
    db
      .select({ at: tasks.updatedAt })
      .from(tasks)
      .where(and(eq(tasks.status, "done"), gte(tasks.updatedAt, eightWeeksAgo), inScope(tasks.clientId))),
  ]);

  // The gauge shows the latest scored audit, and compares it with the
  // previous audit OF THE SAME PROJECT — comparing two different sites'
  // scores says nothing about either.
  const latest = trendAudits[0] ?? null;
  const latestScore = latest?.score ?? null;
  const previousSame = latest
    ? trendAudits.slice(1).find((a) => a.clientId === latest.clientId) ?? null
    : null;
  const scoreDelta =
    latest && previousSame ? latest.score - previousSame.score : null;

  // Small trend lines: scores of the recent audits, and tasks finished
  // per week over the last eight weeks.
  const scoreTimeline = trendAudits.slice(0, 8).map((a) => a.score).reverse();
  const doneWeekly = weeklyCounts(
    doneRows.map((r) => r.at).filter((d): d is Date => d instanceof Date),
    now,
  ).map((w) => w.count);
  const shortDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fmtDelta = (d: number) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* HERO — greeting on the left, the latest audit's gauge on the right. */}
      <section className="grid gap-6 rounded-xl border border-border bg-card p-5 shadow sm:p-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0 space-y-3">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" aria-hidden />
            {t("badge")}
          </div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
            {isFresh
              ? t("welcomeTitle")
              : t("returningTitle", { greeting: greetingForHour(now.getHours()) })}
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isFresh ? t("welcomeBody") : t("returningBody")}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {isFresh ? (
              <>
                {/* Lead with the thing that produces a result: audits
                    need no AI key. */}
                <Link href="/clients/new" className={buttonVariants()}>
                  {t("addFirstSite")}
                </Link>
                <Link
                  href="/settings#ai"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("orConnectAi")}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </>
            ) : (
              <>
                {!scoped && (
                  <Link href="/clients/new" className={buttonVariants()}>
                    {t("addClient")}
                  </Link>
                )}
                <Link
                  href="/clients"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("viewClients")}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>

        {!isFresh && (
          <div className="flex min-w-0 items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <ScoreGauge score={latestScore} />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
                <span>{t("latestAudit")}</span>
                {latest && (
                  <FreshnessBadge capturedAt={latest.completedAt ?? latest.createdAt} source="Audit" />
                )}
              </div>
              <div className="truncate text-sm font-medium text-foreground">
                {latest
                  ? latest.clientName ?? t("clientFallback", { id: latest.clientId })
                  : "—"}
              </div>
              {scoreDelta !== null ? (
                <div
                  className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
                    scoreDelta > 0
                      ? "text-emerald-600 dark:text-emerald-300"
                      : scoreDelta < 0
                        ? "text-rose-600 dark:text-rose-300"
                        : "text-muted-foreground"
                  }`}
                >
                  {scoreDelta === 0 ? t("unchanged") : `${fmtDelta(scoreDelta)} ${t("vsPrevious")}`}
                </div>
              ) : latest ? (
                <div className="text-[11px] text-muted-foreground">{t("firstMeasurement")}</div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      {/* STATS — hidden on a fresh workspace, where four zeros say nothing. */}
      {!isFresh && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            className="animate-page-enter stagger-1"
            label={t("openTasks")}
            value={openTaskCount}
            accent="violet"
            icon={ListChecks}
            hint={openTaskCount > 0 ? t("openTasksHint") : t("allCaughtUp")}
            spark={doneWeekly.some((n) => n > 0) ? doneWeekly : undefined}
          />
          <StatCard
            className="animate-page-enter stagger-2"
            label={t("clients")}
            value={clientCount}
            accent="cyan"
            icon={Users}
            hint={t("clientsHint")}
          />
          <StatCard
            className="animate-page-enter stagger-3"
            label={t("auditsRun")}
            value={auditCount}
            accent="amber"
            icon={ClipboardList}
            hint={
              trendAudits.length > 0
                ? t("completedCount", { count: trendAudits.length })
                : t("runFirst")
            }
            spark={scoreTimeline.length > 1 ? scoreTimeline : undefined}
          />
          <StatCard
            className="animate-page-enter stagger-4"
            label={t("latestScore")}
            value={latestScore ?? "—"}
            accent="emerald"
            icon={Sparkles}
            // Derived from what our crawler saw, so it can disagree with
            // what Google last indexed — worth saying, because this is the
            // figure that ends up in client reports.
            source="crawl"
            hint={
              latest
                ? latest.clientName ?? t("clientFallback", { id: latest.clientId })
                : t("runAuditFirst")
            }
            // The hero already says "compared with the previous audit"; here
            // the arrow and the number are enough, and a zero says nothing.
            delta={scoreDelta ? { value: scoreDelta } : undefined}
          />
        </div>
      )}

      {/* What is wrong with the install, then what the agent may do —
          asking someone to let the agent write to a site is the wrong
          question while the connection to that site is broken. Owners
          and managers only. Both render nothing when there is nothing to
          say. */}
      {!scoped && (
        <>
          <Suspense fallback={null}>
            <InstallHealthBanner />
          </Suspense>
          <Suspense fallback={null}>
            <AutonomyPrompt />
          </Suspense>
        </>
      )}

      {/* GET STARTED — two columns on a fresh workspace (checklist +
          features), one once there are clients (the checklist hides
          itself when done). */}
      {isFresh ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Suspense fallback={null}>
              <OnboardingChecklistPanel />
            </Suspense>
          </div>
          <FeatureHighlights t={t} />
        </div>
      ) : scoped ? null : (
        <Suspense fallback={null}>
          <OnboardingChecklistPanel />
        </Suspense>
      )}

      {!isFresh && (
        <Suspense fallback={<DashboardPanelSkeleton lines={4} />}>
          <MorningBriefing />
        </Suspense>
      )}

      {/* Agency-wide panels: every client, so owners and managers only. */}
      {!isFresh && !scoped && (
        <>
          <Suspense fallback={<DashboardPanelSkeleton lines={3} />}>
            <AgencyWeekInReview />
          </Suspense>
          <Suspense fallback={<DashboardPanelSkeleton lines={5} />}>
            <PortfolioTrafficPanel />
          </Suspense>
          <Suspense fallback={<DashboardPanelSkeleton lines={3} />}>
            <PortfolioQuickWinsPanel />
          </Suspense>
        </>
      )}

      {/* PRIORITY TASKS + RECENT AUDITS */}
      {!isFresh && (priorityTasks.length > 0 || recentAudits.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-5">
          {priorityTasks.length > 0 && (
            <section className="min-w-0 rounded-lg border border-border bg-card lg:col-span-3">
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <Sparkles className="size-3.5 text-violet-400" aria-hidden />
                    {t("priorityTasks")}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t("priorityTasksHint")}</p>
                </div>
                <Link
                  href="/tasks"
                  className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("viewAll")}
                  <ArrowUpRight className="size-3" />
                </Link>
              </header>
              <ul className="divide-y divide-border">
                {priorityTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-start justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <Link
                        href={`/tasks?client=${task.clientId}#task-${task.id}`}
                        className="block break-words text-[13px] font-medium leading-snug text-foreground hover:underline"
                      >
                        {taskTitle(task.title, locale)}
                      </Link>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        {task.clientName && (
                          <Link
                            href={`/clients/${task.clientId}`}
                            className="text-muted-foreground hover:text-foreground hover:underline"
                          >
                            {task.clientName}
                          </Link>
                        )}
                        <TaskToolLink
                          task={{
                            id: task.id,
                            toolPath: task.toolPath,
                            sourceRef: task.sourceRef,
                            clientId: task.clientId,
                            pageUrl: taskPageUrl(task.pages) ?? task.clientUrl ?? null,
                          }}
                        />
                      </div>
                    </div>
                    <span className={`shrink-0 ${PRIORITY_TAG[task.priority] ?? "gsk-tag gsk-tag--default"}`}>
                      {t(`briefing.priority.${task.priority as "high" | "medium" | "low"}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recentAudits.length > 0 && (
            <section
              className={`min-w-0 rounded-lg border border-border bg-card ${
                priorityTasks.length > 0 ? "lg:col-span-2" : "lg:col-span-5"
              }`}
            >
              <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                    <ClipboardList className="size-3.5 text-violet-400" aria-hidden />
                    {t("recentAudits")}
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{t("recentAuditsHint")}</p>
                </div>
                <Link
                  href="/audits"
                  className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("viewAll")}
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
                        {a.clientName ?? t("clientFallback", { id: a.clientId })}
                      </Link>
                      <div className="text-[11px] text-muted-foreground">
                        {shortDate.format(a.completedAt ?? a.createdAt)} ·{" "}
                        {t("issues", { count: a.issuesCount })}
                      </div>
                    </div>
                    <ScoreBadge score={a.status === "completed" ? a.score : null} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* PROJECTS — this fork's table (or cards), one row per project. */}
      {!isFresh && (
        <PortfolioOverview view={vue === "cartes" ? "cards" : "list"} only="projects" />
      )}

      {/* SCORE TREND */}
      {!isFresh && trendAudits.length >= 2 && (
        <section className="min-w-0 rounded-xl border border-border bg-card p-4 shadow sm:p-6">
          <header className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("scoreTrend")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("scoreTrendHint", { count: trendAudits.length })}
            </p>
          </header>
          <AreaChart
            data={[...trendAudits].reverse().map((a) => ({
              name: shortDate.format(a.completedAt ?? a.createdAt),
              value: a.score,
            }))}
            colorClass="text-violet-500"
            height={220}
            formatValue="score"
          />
        </section>
      )}

      <BentoQuickActions t={t} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  let cls = "border-border bg-muted text-muted-foreground";
  if (score !== null) {
    if (score >= 80) cls = "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    else if (score >= 50) cls = "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    else cls = "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  return (
    <span
      className={`inline-flex h-8 w-10 shrink-0 items-center justify-center rounded-md border text-[13px] font-semibold tabular-nums ${cls}`}
    >
      {score ?? "—"}
    </span>
  );
}

type DashboardT = Awaited<ReturnType<typeof getTranslations>>;

type BentoTile = {
  href: string;
  titleKey: "bento.auditsTitle" | "bento.keywordsTitle" | "bento.reportsTitle" | "bento.agentTitle" | "bento.backlinksTitle" | "bento.toolsTitle";
  descKey: "bento.auditsDesc" | "bento.keywordsDesc" | "bento.reportsDesc" | "bento.agentDesc" | "bento.backlinksDesc" | "bento.toolsDesc";
  icon: LucideIcon;
  iconColor: string;
  /** Optional col / row span for the asymmetric Bento layout */
  className?: string;
};

const BENTO_TILES: BentoTile[] = [
  {
    href: "/audits",
    titleKey: "bento.auditsTitle",
    descKey: "bento.auditsDesc",
    icon: ClipboardList,
    iconColor: "text-violet-300",
    className: "md:col-span-2 md:row-span-2",
  },
  {
    href: "/keywords",
    titleKey: "bento.keywordsTitle",
    descKey: "bento.keywordsDesc",
    icon: Search,
    iconColor: "text-cyan-300",
  },
  {
    href: "/reports",
    titleKey: "bento.reportsTitle",
    descKey: "bento.reportsDesc",
    icon: FileDown,
    iconColor: "text-amber-300",
  },
  {
    href: "/agent",
    titleKey: "bento.agentTitle",
    descKey: "bento.agentDesc",
    icon: Bot,
    iconColor: "text-fuchsia-300",
    className: "md:col-span-2",
  },
  {
    href: "/backlinks",
    titleKey: "bento.backlinksTitle",
    descKey: "bento.backlinksDesc",
    icon: Link2,
    iconColor: "text-emerald-300",
  },
  {
    href: "/tools",
    titleKey: "bento.toolsTitle",
    descKey: "bento.toolsDesc",
    icon: Wrench,
    iconColor: "text-rose-300",
  },
];

function BentoQuickActions({ t }: { t: DashboardT }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("quickActions")}
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
                  {t(tile.titleKey)}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {t(tile.descKey)}
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

/**
 * "What you'll unlock" side panel shown on the fresh dashboard. Replaces
 * the old wordy WelcomeTour with a tighter visual: feature pills + the
 * "100+ tools" stat, anchoring the page right-hand column.
 */
function FeatureHighlights({ t }: { t: DashboardT }) {
  const highlights = [
    { icon: ClipboardList, label: t("highlights.audits"), tone: "text-violet-400" },
    { icon: Search, label: t("highlights.ranks"), tone: "text-cyan-400" },
    { icon: FileDown, label: t("highlights.reports"), tone: "text-amber-400" },
    { icon: Bot, label: t("highlights.agent"), tone: "text-fuchsia-400" },
    { icon: Link2, label: t("highlights.backlinks"), tone: "text-emerald-400" },
    { icon: Wrench, label: t("highlights.tools"), tone: "text-rose-400" },
  ];
  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-violet-400">
          {t("unlockEyebrow")}
        </div>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          {t("unlockTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("unlockBody")}
        </p>
      </div>
      <ul className="space-y-1.5">
        {highlights.map(({ icon: Icon, label, tone }) => (
          <li
            key={label}
            className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-sm text-foreground"
          >
            <Icon className={`size-3.5 ${tone}`} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-3">
        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="text-xs font-medium text-violet-300">{t("noPaidApis")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("noPaidApisBody")}
          </p>
        </div>
        {/* Maintainer credit — subtle, links to source + support */}
        <MaintainerCredit variant="inline" />
      </div>
    </aside>
  );
}

function DashboardPanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <Skeleton.Line className="w-40" />
      <div className="mt-4">
        <Skeleton.Lines count={lines} />
      </div>
    </section>
  );
}
