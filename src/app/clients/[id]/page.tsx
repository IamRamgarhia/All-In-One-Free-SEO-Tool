import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc, and, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  AlertCircle,
  Bot,
  ClipboardList,
  ExternalLink,
  FileDown,
  Layers,
  Link2,
  MoreHorizontal,
  Pencil,
  Play,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { db } from "@/db/client";
import { audits, clients, keywords, tasks } from "@/db/schema";
import { Button, buttonVariants } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { SiteFavicon } from "@/components/ui/site-favicon";
import { StatCard } from "@/components/ui/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandingPreflightBanner } from "./branding-preflight-banner";
import {
  applyNicheTemplates,
  applyStackTemplates,
  redetectTechStack,
  refreshClientMetadataForm,
} from "../actions";
import { pickStackTemplates, STACK_LABELS } from "@/lib/tech-stack-templates";
import {
  runAuditForClient,
} from "@/app/audits/actions";
import { ShareCard } from "./share-card";
import { GscKeywordsPanel } from "./gsc-keywords-panel";
import { QuickWinsPanel } from "./quick-wins-panel";
import { SnapshotSparklines } from "@/components/snapshot-sparklines";
import { OrganicTrafficPanel } from "./organic-traffic-panel";
import { ProjectSettings } from "./project-settings";
import { getGoogleConnectionStatus } from "@/lib/google-oauth";
import { getSetting } from "@/lib/settings-store";
import { getSmtpConfig } from "@/lib/mailer";
import {
  reportSchedules,
  auditIssues,
  keywordRankings,
  backlinks,
  reportArchives,
  clientMetricSnapshots,
  proposals,
} from "@/db/schema";
import { Dropdown } from "@/components/ui/dropdown";
import { ClientToolsPanel } from "./client-tools-panel";
import { StartHere, startHereStepsLeft } from "./start-here";
import { ClientActionPlan } from "./client-action-plan";
import { parseProjectTab } from "./project-tabs";
import { ProjectMissions } from "./project-missions";
import { auditFacts, listMissions } from "@/lib/projects";
import { ProjectJourney } from "./project-journey";
import { featuredToolKeys } from "@/lib/project-tools";
import { NextActionsPanel } from "@/components/next-actions-panel";
import { nextActions } from "@/lib/next-actions";
import { surfacesFor } from "@/lib/engagement-surfaces";
import { getAiAvailability } from "@/lib/ai-availability";
import { DeleteClientButton } from "./delete-client-button";
import { DailyAutomationCard } from "./daily-automation-card";
import { inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getDisabledTools } from "@/lib/tool-activation";
import { getTranslations } from "next-intl/server";

type T = Awaited<ReturnType<typeof getTranslations<"clientPage">>>;

function nicheLabel(niche: string, t: T): string {
  return t.has(`niches.${niche}`) ? t(`niches.${niche}`) : niche;
}

const nicheTone: Record<string, string> = {
  local: "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  ecommerce: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20",
  saas: "bg-amber-500/15 text-amber-300 ring-amber-500/20",
  blog: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  services: "bg-rose-500/15 text-rose-300 ring-rose-500/20",
};

/**
 * Compact relative-time formatter for the client hero — "2 hours ago",
 * "5 days ago", "3 months ago". Defaults to "today" for anything under
 * an hour so the copy reads naturally even right after a fresh audit.
 */
function relativeTime(date: Date, t: T): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60 * 60) return t("ago.today");
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return t("ago.hours", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 14) return t("ago.days", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return t("ago.weeks", { count: weeks });
  const months = Math.floor(days / 30);
  if (months < 18) return t("ago.months", { count: months });
  const years = Math.floor(days / 365);
  return t("ago.years", { count: years });
}

function PanelSkeleton({ title }: { title: string }) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="relative border-b border-white/[0.06] px-5 py-4">
        <div className="text-sm text-muted-foreground">{title}</div>
      </header>
      <div className="space-y-2 p-5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </section>
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
      className={`inline-flex h-9 w-12 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-inset ${tone} ${textTone}`}
    >
      {score ?? "—"}
    </span>
  );
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tx = await getTranslations("ui.app_clients_id_page");
  const { id } = await params;
  const t = await getTranslations("clientPage");
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();
  const sp = (await searchParams) ?? {};
  const brandingNeeded = sp["branding-needed"] === "1";
  const tab = parseProjectTab(sp.tab);
  const brandingTemplate =
    typeof sp.template === "string" ? sp.template : "executive";

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client) notFound();

  const recentAudits = await db
    .select()
    .from(audits)
    .where(eq(audits.clientId, clientId))
    .orderBy(desc(audits.createdAt))
    .limit(5);

  // Health score from the latest site audit (or a legacy SEOmator one).
  // Never ai_full: a different scale.
  const [latestCompleted = null] = await db
    .select()
    .from(audits)
    .where(
      and(
        eq(audits.clientId, clientId),
        eq(audits.status, "completed"),
        inArray(audits.kind, ["crawler", "seomator"]),
      ),
    )
    .orderBy(desc(audits.completedAt))
    .limit(1);

  const [{ value: openTaskCount }] = await db
    .select({ value: count() })
    .from(tasks)
    .where(and(eq(tasks.clientId, clientId), eq(tasks.status, "todo")));

  const [{ value: keywordCount }] = await db
    .select({ value: count() })
    .from(keywords)
    .where(eq(keywords.clientId, clientId));

  // Last ~8 snapshots, oldest-first, feed the StatCard sparklines.
  // criticalIssues + highIssues are summed for the issues spark; the
  // keywordCount column is reused directly. Open-task sparklines are
  // skipped here because the snapshot table doesn't track them — the
  // hint copy carries that read instead.
  const recentSnapshots = await db
    .select({
      criticalIssues: clientMetricSnapshots.criticalIssues,
      highIssues: clientMetricSnapshots.highIssues,
      keywordCount: clientMetricSnapshots.keywordCount,
      capturedAt: clientMetricSnapshots.capturedAt,
    })
    .from(clientMetricSnapshots)
    .where(eq(clientMetricSnapshots.clientId, clientId))
    .orderBy(desc(clientMetricSnapshots.capturedAt))
    .limit(8);
  const orderedSnapshots = recentSnapshots.slice().reverse();
  const issuesSpark = orderedSnapshots
    .map(
      (s) =>
        (s.criticalIssues ?? 0) + (s.highIssues ?? 0),
    );
  const keywordsSpark = orderedSnapshots
    .map((s) => s.keywordCount)
    .filter((v): v is number => v !== null);

  // Counts shown in the delete-confirmation dialog so the user sees
  // exactly what they're about to wipe.
  const clientAuditIds = (
    await db
      .select({ id: audits.id })
      .from(audits)
      .where(eq(audits.clientId, clientId))
  ).map((a) => a.id);
  const clientKeywordIds = (
    await db
      .select({ id: keywords.id })
      .from(keywords)
      .where(eq(keywords.clientId, clientId))
  ).map((k) => k.id);

  const [
    [{ value: deleteAuditCount }],
    [{ value: deleteAuditIssueCount }],
    [{ value: deleteTaskCount }],
    [{ value: deleteRankingCount }],
    [{ value: deleteBacklinkCount }],
    [{ value: deleteReportCount }],
    [{ value: deleteSnapshotCount }],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(audits)
      .where(eq(audits.clientId, clientId)),
    clientAuditIds.length > 0
      ? db
          .select({ value: count() })
          .from(auditIssues)
          .where(inArray(auditIssues.auditId, clientAuditIds))
      : Promise.resolve([{ value: 0 }]),
    db
      .select({ value: count() })
      .from(tasks)
      .where(eq(tasks.clientId, clientId)),
    clientKeywordIds.length > 0
      ? db
          .select({ value: count() })
          .from(keywordRankings)
          .where(inArray(keywordRankings.keywordId, clientKeywordIds))
      : Promise.resolve([{ value: 0 }]),
    db
      .select({ value: count() })
      .from(backlinks)
      .where(eq(backlinks.clientId, clientId)),
    db
      .select({ value: count() })
      .from(reportArchives)
      .where(eq(reportArchives.clientId, clientId)),
    db
      .select({ value: count() })
      .from(clientMetricSnapshots)
      .where(eq(clientMetricSnapshots.clientId, clientId)),
  ]);

  const redetectAction = redetectTechStack.bind(null, client.id);
  const refreshMetadataAction = refreshClientMetadataForm.bind(null, client.id);
  const runQuickAction = runAuditForClient.bind(null, client.id, "quick");
  const runDeepAction = runAuditForClient.bind(null, client.id, "full");
  const applyTemplatesAction = applyNicheTemplates.bind(null, client.id);
  const applyStackAction = applyStackTemplates.bind(null, client.id);
  const { matched: matchedStacks } = pickStackTemplates(client.techStack);
  const googleStatus = await getGoogleConnectionStatus();
  const googleClientId = await getSetting<string>("google.client_id");
  const googleClientSecret = await getSetting<string>("google.client_secret");
  const hdrs = await headers();
  const host =
    hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const googleRedirectUri = `${proto}://${host}/api/google/callback`;

  const smtpConfigured = Boolean(await getSmtpConfig());
  // The approval document for this client, if one has been built. Newest
  // first — re-running onboarding writes another, and the current one is
  // the one the Start-here strip should be talking about.
  const [approvalDoc] = await db
    .select({ id: proposals.id, status: proposals.status })
    .from(proposals)
    .where(eq(proposals.clientId, clientId))
    .orderBy(desc(proposals.id))
    .limit(1);

  // Drives the ready/blocked dots in the per-client tool rail. `hasKey`,
  // not `available` — the rail is asking whether the tool page you are
  // about to open can call a model itself.
  const ai = await getAiAvailability();
  const disabledTools = await getDisabledTools();
  // Ranked work for this client alone. The Start-here strip above covers
  // setup; this covers everything after it, and says which half the agent
  // will take.
  const ranked = await nextActions({ clientId, limit: 8 });
  const projectMissions = await listMissions(clientId);
  const journeyAudit = await auditFacts(clientId);
  const startHereLeft = startHereStepsLeft({
    auditDone: Boolean(latestCompleted),
    keywordCount,
    proposalStatus: approvalDoc?.status ?? null,
    onboardingDone: client.onboardingStep === "completed",
  });
  const [scheduleRow] = await db
    .select()
    .from(reportSchedules)
    .where(eq(reportSchedules.clientId, clientId))
    .orderBy(desc(reportSchedules.updatedAt))
    .limit(1);

  return (
    <div className="space-y-6">
      {brandingNeeded && (
        <BrandingPreflightBanner
          clientId={clientId}
          template={brandingTemplate}
        />
      )}

      {/*
        Two-column layout on desktop:
          left   — sticky tools sidebar (per-client, all tools pre-wired)
          right  — the main client content (hero, stats, automations,
                   integrations, recent activity, etc.)

        Below md the sidebar collapses to a button + sheet so the main
        content gets full width.
      */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <ClientToolsPanel
          disabledTools={[...disabledTools]}
          top={
            <ClientActionPlan
              setupLeft={startHereLeft}
              recommendationCount={ranked.length}
              startHere={
                <StartHere
                  clientId={client.id}
                  auditDone={Boolean(latestCompleted)}
                  auditFindings={latestCompleted?.issuesCount ?? null}
                  keywordCount={keywordCount}
                  proposalId={approvalDoc?.id ?? null}
                  proposalStatus={approvalDoc?.status ?? null}
                  onboardingDone={client.onboardingStep === "completed"}
                />
              }
              recommendations={
                <NextActionsPanel
                  items={ranked}
                  heading={t("nextActionsHeading")}
                  emptyNote={t("nextActionsEmpty")}
                  showClient={false}
                />
              }
            />
          }
          client={{
            id: client.id,
            url: client.url,
            gscProperty: client.gscProperty,
            gbpUrl: client.gbpUrl,
            ga4PropertyId: client.ga4PropertyId,
            wpEndpoint: client.wpEndpoint,
          }}
          hasAiKey={ai.hasKey}
          surfaces={surfacesFor(client.surfacesJson, client.niche)}
          featured={featuredToolKeys(tab, projectMissions)}
        />

        <div className="min-w-0 flex-1 space-y-6">
      {tab === "overview" && (
        <ProjectJourney
          projectId={client.id}
          anyAuditDone={Boolean(latestCompleted)}
          siteAuditDone={(journeyAudit.fullAuditDone || journeyAudit.quickAuditDone) && journeyAudit.pagesCrawled !== 0}
          onboardingDone={client.onboardingStep === "completed"}
          proposalId={approvalDoc?.id ?? null}
          proposalStatus={approvalDoc?.status ?? null}
          missions={projectMissions.map((m) => ({ kind: m.kind, status: m.status }))}
          reportCount={deleteReportCount}
          reportScheduled={Boolean(scheduleRow?.enabled)}
        />
      )}
      {/*
        HERO — editorial composition.
        Top accent rule colored by score band gives the card a magazine-masthead
        feel. Left column owns identity; right column makes the score the
        unambiguous focal point with a tabular display number + horizontal
        strength bar.
        Action row collapses 10 buttons into a hero CTA + 4 primaries + a
        "More" overflow so the visual weight reads as decisive, not busy.
      */}
      {(() => {
        const score = latestCompleted?.score ?? null;
        const tone: "muted" | "emerald" | "amber" | "rose" =
          score === null
            ? "muted"
            : score >= 75
              ? "emerald"
              : score >= 50
                ? "amber"
                : "rose";
        const toneClasses = {
          muted: {
            number: "text-muted-foreground",
            bar: "bg-muted-foreground/30",
            stripe: "from-transparent via-border to-transparent",
            ringFavicon: "ring-border",
            chipLabel: "text-muted-foreground",
            chipBg: "bg-muted/40 ring-border",
          },
          emerald: {
            number: "text-emerald-300",
            bar: "bg-emerald-400",
            stripe: "from-emerald-500/0 via-emerald-400/70 to-emerald-500/0",
            ringFavicon: "ring-emerald-500/40",
            chipLabel: "text-emerald-300",
            chipBg: "bg-emerald-500/10 ring-emerald-500/30",
          },
          amber: {
            number: "text-amber-300",
            bar: "bg-amber-400",
            stripe: "from-amber-500/0 via-amber-400/70 to-amber-500/0",
            ringFavicon: "ring-amber-500/40",
            chipLabel: "text-amber-300",
            chipBg: "bg-amber-500/10 ring-amber-500/30",
          },
          rose: {
            number: "text-rose-300",
            bar: "bg-rose-400",
            stripe: "from-rose-500/0 via-rose-400/70 to-rose-500/0",
            ringFavicon: "ring-rose-500/40",
            chipLabel: "text-rose-300",
            chipBg: "bg-rose-500/10 ring-rose-500/30",
          },
        }[tone];
        const auditedLabel = latestCompleted?.completedAt
          ? relativeTime(latestCompleted.completedAt, t)
          : null;
        const auditedDateFull = latestCompleted?.completedAt
          ? latestCompleted.completedAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null;
        const barFill = score === null ? 0 : Math.max(2, Math.min(100, score));

        // The hero card is deliberately NOT overflow-hidden.
        //
        // It was, to clip the masthead stripe to the rounded corners —
        // and it clipped the "Generate report" menu too, which opens
        // downward from a button inside this card. The card's bottom
        // edge sat 130px above the menu's, so the user saw one item of
        // three and a box cut in half. The stripe rounds its own top
        // corners instead, which is all the clipping was ever for.
        // Anything added here that needs clipping should clip itself.
        return (
          <section className="relative rounded-2xl border border-border bg-card shadow-xl">
            {/* Score-colored masthead stripe */}
            <div
              aria-hidden
              className={`h-px w-full rounded-t-2xl bg-gradient-to-r ${toneClasses.stripe}`}
            />

            <div className="p-6 sm:p-8">
              {/* Breadcrumb — editorial micro caps */}
              <nav
                aria-label={tx("breadcrumb")}
                className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              >
                <Link
                  href="/clients"
                  className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  {t("breadcrumb")}
                </Link>
                <span aria-hidden className="text-muted-foreground/40">·</span>
                <span aria-current="page" className="truncate text-foreground/80">
                  {client.name}
                </span>
              </nav>

              {/* Headline grid */}
              <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                {/* LEFT — identity */}
                <div className="min-w-0 space-y-5">
                  <div className="flex items-start gap-4">
                    <span
                      className={`shrink-0 rounded-2xl ring-2 ring-offset-2 ring-offset-card transition-colors ${toneClasses.ringFavicon}`}
                    >
                      <SiteFavicon
                        url={client.url}
                        name={client.name}
                        size={56}
                      />
                    </span>
                    <div className="min-w-0 space-y-2">
                      <h1 className="break-words text-[2.25rem] font-bold leading-[1.02] tracking-tight text-foreground sm:text-[2.75rem] lg:text-5xl">
                        {client.name}
                      </h1>
                      <a
                        href={client.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={t("opensNewTab", { url: client.url })}
                        className="group inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 font-mono text-[12px] text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                      >
                        <span className="truncate">
                          {client.url.replace(/^https?:\/\//, "")}
                        </span>
                        <ExternalLink
                          aria-hidden
                          className="size-3 shrink-0 opacity-60 group-hover:opacity-100"
                        />
                      </a>
                    </div>
                  </div>

                  {/* Metadata strip */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                    {client.niche && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${nicheTone[client.niche] ?? "bg-muted text-muted-foreground"}`}
                      >
                        <Sparkles className="size-3" />
                        {nicheLabel(client.niche, t)}
                      </span>
                    )}
                    {client.techStack && client.techStack.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">
                        <Layers className="size-3" />
                        {t("techDetected", { count: client.techStack.length })}
                      </span>
                    )}
                    {auditedLabel && latestCompleted?.completedAt && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span
                          aria-hidden
                          className="size-1 rounded-full bg-muted-foreground/50"
                        />
                        <span>
                          {t("audited")}{" "}
                          <time
                            dateTime={latestCompleted.completedAt.toISOString()}
                          >
                            {auditedLabel}
                          </time>
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* RIGHT — score panel.
                    Wrapped in <dl> so the caption / number / sub-metadata
                    relate semantically — screen readers announce as
                    "Health score: 32 out of 100. 13 issues found. May 12,
                    2026." */}
                <dl
                  className="relative lg:border-l lg:border-border lg:pl-8"
                  aria-label={t("latestAuditSummary")}
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {t("healthScore")}
                  </dt>
                  <dd className="mt-2 flex items-baseline gap-2">
                    <span
                      className={`font-bold tabular-nums leading-none ${toneClasses.number}`}
                      style={{ fontSize: "clamp(4rem, 6vw, 5.5rem)" }}
                      aria-label={
                        score === null
                          ? t("noScore")
                          : t("scoreOutOf", { score })
                      }
                    >
                      {score === null ? "—" : score}
                    </span>
                    <span
                      aria-hidden
                      className="text-xl font-medium text-muted-foreground/60"
                    >
                      /100
                    </span>
                  </dd>
                  {/* Strength bar — decorative; the numeric label above
                      already carries the semantic value. Animation guarded
                      by motion-safe so prefers-reduced-motion users get an
                      instant fill. */}
                  <dd
                    aria-hidden
                    className="mt-4 h-1 w-full overflow-hidden rounded-full bg-muted/40"
                  >
                    <div
                      className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 ${toneClasses.bar}`}
                      style={{ width: `${barFill}%` }}
                    />
                  </dd>
                  <dd className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {latestCompleted ? (
                      <>
                        <span className="font-medium text-foreground/80 tabular-nums">
                          {latestCompleted.issuesCount}
                        </span>
                        <span>{t("issuesFound")}</span>
                        <span aria-hidden className="text-muted-foreground/40">
                          ·
                        </span>
                        {latestCompleted.completedAt && (
                          <time
                            dateTime={latestCompleted.completedAt.toISOString()}
                          >
                            {auditedDateFull}
                          </time>
                        )}
                      </>
                    ) : (
                      <span>
                        {recentAudits[0]?.status === "failed" ? t("lastAuditFailed") : t("runToScore")}
                      </span>
                    )}
                  </dd>
                </dl>
              </div>

              {/* Hairline + action row */}
              <div className="mt-7 border-t border-border pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* One audit, two depths: same crawl, checks and tables. */}
                  <form action={runQuickAction}>
                    <SubmitButton
                      icon={<Play className="size-3.5" />}
                      pendingChildren={t("quickRunning")}
                      pendingToast={t("quickToast")}
                      pendingToastDescription={t("quickToastBody")}
                    >
                      {t("quickAudit")}
                    </SubmitButton>
                  </form>
                  <form action={runDeepAction}>
                    <SubmitButton
                      variant="outline"
                      icon={<Play className="size-3.5" />}
                      pendingChildren={t("fullRunning")}
                      pendingToast={t("fullToast")}
                      pendingToastDescription={t("fullToastBody")}
                    >
                      {t("fullAudit")}
                    </SubmitButton>
                  </form>

                  {/* Generate report dropdown */}
                  <Dropdown
                    width={240}
                    className={buttonVariants({ variant: "outline" })}
                    trigger={
                      <>
                        <FileDown className="size-3.5" />
                        {t("generateReport")}
                      </>
                    }
                  >
                    <div>
                      <Link
                        href={`/reports/${client.id}?template=executive`}
                        className="block px-3 py-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">{t("reports.executive")}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("reports.executiveHint")}
                        </div>
                      </Link>
                      <Link
                        href={`/reports/${client.id}?template=detailed`}
                        className="block border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">{t("reports.detailed")}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("reports.detailedHint")}
                        </div>
                      </Link>
                      <Link
                        href={`/reports/${client.id}?template=technical`}
                        className="block border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">{t("reports.technical")}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {t("reports.technicalHint")}
                        </div>
                      </Link>
                    </div>
                  </Dropdown>

                  {/* Primary AI surface */}
                  <Link
                    href={`/clients/${client.id}/ai-audit`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "border-violet-500/30 bg-violet-500/10",
                    })}
                  >
                    <Bot className="size-3.5" />
                    {t("aiAudit")}
                  </Link>

                  {/* Onboarding — emphasised when not completed */}
                  <Link
                    href={`/clients/${client.id}/onboarding`}
                    className={buttonVariants({
                      variant: "outline",
                      className:
                        client.onboardingStep === "completed"
                          ? ""
                          : "border-violet-500/40 bg-violet-500/10 text-violet-200",
                    })}
                    title={
                      client.onboardingStep === "completed"
                        ? t("replanTitle")
                        : t("onboardingTitle")
                    }
                  >
                    <Sparkles className="size-3.5" />
                    {client.onboardingStep === "completed"
                      ? t("replan")
                      : t("onboarding")}
                  </Link>

                  {/* Overflow — everything else */}
                  <div className="ml-auto">
                  <Dropdown
                    align="right"
                    width={224}
                    className={buttonVariants({ variant: "outline" })}
                    trigger={
                      <>
                        <MoreHorizontal className="size-3.5" />
                        {t("more")}
                      </>
                    }
                  >
                    <div>
                      <Link
                        href={`/agent/c/${client.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Bot className="size-3.5 text-violet-300" />
                        {t("menu.agent")}
                      </Link>
                      <Link
                        href={`/clients/${client.id}/plan`}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Layers className="size-3.5 text-violet-300" />
                        {t("menu.plan")}
                      </Link>
                      <Link
                        href={`/findings/c/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <ClipboardList className="size-3.5 text-cyan-300" />
                        {t("menu.findings")}
                      </Link>
                      <Link
                        href={`/blog/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Wand2 className="size-3.5 text-violet-300" />
                        {t("menu.blog")}
                      </Link>
                      <Link
                        href={`/guest-posts/c/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Wand2 className="size-3.5 text-amber-300" />
                        {t("menu.guestPosts")}
                      </Link>
                      <Link
                        href={`/link-building/c/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Link2 className="size-3.5 text-emerald-300" />
                        {t("menu.backlinks")}
                      </Link>
                      <Link
                        href={`/clients/${client.id}/edit`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Pencil className="size-3.5 text-muted-foreground" />
                        {t("menu.edit")}
                      </Link>
                      <form
                        action={refreshMetadataAction}
                        className="border-t border-border"
                      >
                        <SubmitButton
                          variant="ghost"
                          icon={
                            <RefreshCw className="size-3.5 text-muted-foreground" />
                          }
                          pendingChildren={t("menu.refreshing")}
                          pendingToast={t("menu.refreshToast")}
                          pendingToastDescription={t("menu.refreshToastBody")}
                          title={t("menu.refreshTitle")}
                          className="w-full justify-start rounded-none px-3 py-2 text-sm font-normal hover:bg-accent"
                        >
                          {t("menu.refresh")}
                        </SubmitButton>
                      </form>
                    </div>
                  </Dropdown>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {tab === "overview" && (
        <>

      {/* STATS — or inviting empty-state when this client has no data yet */}
      {latestCompleted || keywordCount > 0 || openTaskCount > 0 ? (
        (() => {
          // Snapshot-driven deltas. We compare the latest snapshot's
          // value to the snapshot from ~7 days ago (or the oldest we
          // have if there aren't enough). Only shown when both ends
          // exist so we don't fabricate movement.
          const lastIdx = orderedSnapshots.length - 1;
          const baseIdx = Math.max(0, lastIdx - 6);
          const issuesDelta =
            lastIdx > baseIdx && issuesSpark.length >= 2
              ? issuesSpark[issuesSpark.length - 1] - issuesSpark[baseIdx]
              : null;
          const kwDelta =
            lastIdx > baseIdx && keywordsSpark.length >= 2
              ? keywordsSpark[keywordsSpark.length - 1] -
                keywordsSpark[baseIdx]
              : null;

          return (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label={t("stats.openIssues")}
                value={latestCompleted?.issuesCount ?? 0}
                accent="amber"
                icon={AlertCircle}
                hint={t("stats.fromLastAudit")}
                // The other two cards on this row count rows in our own
                // database and need no provenance. This one describes
                // the client's website, which is a claim about the
                // outside world and can be out of date.
                source="crawl"
                asOf={latestCompleted?.completedAt ?? null}
                spark={issuesSpark.length >= 2 ? issuesSpark : undefined}
                delta={
                  issuesDelta !== null
                    ? { value: issuesDelta, label: t("stats.vsPrior") }
                    : undefined
                }
              />
              <StatCard
                label={t("stats.openTasks")}
                value={openTaskCount}
                accent="violet"
                icon={ClipboardList}
                hint={t("stats.tasksHint")}
              />
              <StatCard
                label={t("stats.keywords")}
                value={keywordCount}
                accent="cyan"
                icon={Search}
                hint={
                  keywordCount === 0 ? t("stats.noKeywords") : t("stats.inRotation")
                }
                spark={keywordsSpark.length >= 2 ? keywordsSpark : undefined}
                delta={
                  kwDelta !== null
                    ? { value: kwDelta, label: t("stats.vsPrior") }
                    : undefined
                }
              />
            </div>
          );
        })()
      ) : (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-cyan-500/[0.04] via-violet-500/[0.03] to-transparent p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-cyan-500/10 blur-3xl" />
          <header className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              {t("empty.kicker")}
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {t("empty.title", { name: client.name })}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t("empty.body")}
            </p>
          </header>
          <div className="relative mt-5 grid gap-3 sm:grid-cols-3">
            <form action={runQuickAction} className="contents">
              <button
                type="submit"
                className="group flex flex-col items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/[0.06] p-4 text-left transition-colors hover:bg-cyan-500/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="grid size-8 place-items-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                  <Play className="size-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{t("quickAudit")}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {t("empty.quickHint")}
                  </div>
                </div>
                <span className="mt-1 text-[11px] font-medium text-cyan-300 transition-transform group-hover:translate-x-0.5">
                  {t("empty.runNow")}
                </span>
              </button>
            </form>
            <Link
              href={`/keywords/c/${client.id}`}
              className="group flex flex-col items-start gap-2 rounded-xl border border-violet-500/30 bg-violet-500/[0.04] p-4 transition-colors hover:bg-violet-500/[0.10]"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-violet-500/15 text-violet-300 ring-1 ring-inset ring-violet-500/30">
                <Search className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">{t("empty.keywords")}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("empty.keywordsHint")}
                </div>
              </div>
              <span className="mt-1 text-[11px] font-medium text-violet-300 transition-transform group-hover:translate-x-0.5">
                {t("empty.addKeywords")}
              </span>
            </Link>
            <Link
              href={`/clients/${client.id}/onboarding`}
              className="group flex flex-col items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-4 transition-colors hover:bg-emerald-500/[0.10]"
            >
              <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                <Sparkles className="size-4" />
              </span>
              <div>
                <div className="text-sm font-semibold">{t("onboarding")}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("empty.onboardingHint")}
                </div>
              </div>
              <span className="mt-1 text-[11px] font-medium text-emerald-300 transition-transform group-hover:translate-x-0.5">
                {t("empty.autoPlan")}
              </span>
            </Link>
          </div>
        </section>
      )}
        </>
      )}

      {tab === "missions" && <ProjectMissions projectId={client.id} />}

      {tab === "settings" && (
        <>

      {/* GOOGLE, WORDPRESS, SCHEDULED REPORTS: values here, changes in a sheet */}
      <ProjectSettings
        projectId={client.id}
        google={{
          status: googleStatus,
          redirectUri: googleRedirectUri,
          oauthClientId: googleClientId,
          hasSecret: Boolean(googleClientSecret),
          hasWorkspaceCreds: !!googleClientId && !!googleClientSecret,
          projectEmail: client.googleConnectedEmail,
          gsc: client.gscProperty,
          ga4: client.ga4PropertyId,
        }}
        wordpress={{
          connected: Boolean(client.wpEndpoint && client.wpKey),
          endpoint: client.wpEndpoint ?? null,
          looksLikeWordPress: (client.techStack ?? []).some((s) =>
            String(s).toLowerCase().includes("wordpress"),
          ),
        }}
        reports={{
          smtpConfigured,
          schedule: scheduleRow
            ? {
                id: scheduleRow.id,
                template: scheduleRow.template,
                frequency: scheduleRow.frequency,
                dayOfMonth: scheduleRow.dayOfMonth,
                dayOfWeek: scheduleRow.dayOfWeek,
                hourOfDay: scheduleRow.hourOfDay,
                recipients: scheduleRow.recipients,
                enabled: scheduleRow.enabled,
                lastSentAt: scheduleRow.lastSentAt,
                nextSendAt: scheduleRow.nextSendAt,
              }
            : null,
        }}
      />

      {/* DAILY AUTOMATION ENTRY — schedules + queue, per client */}
      <DailyAutomationCard clientId={client.id} />

        </>
      )}
      {tab === "overview" && (
        <>

      {/* LIVE GOOGLE DATA — only when properties are linked */}
      {googleStatus.configured && client.ga4PropertyId && (
        <Suspense
          fallback={
            <PanelSkeleton title={t("loading.traffic")} />
          }
        >
          <OrganicTrafficPanel propertyId={client.ga4PropertyId} />
        </Suspense>
      )}

      {googleStatus.configured && client.gscProperty && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense
            fallback={
              <PanelSkeleton title={t("loading.keywords")} />
            }
          >
            <GscKeywordsPanel siteUrl={client.gscProperty} />
          </Suspense>
          <Suspense
            fallback={<PanelSkeleton title={t("loading.quickWins")} />}
          >
            <QuickWinsPanel siteUrl={client.gscProperty} />
          </Suspense>
        </div>
      )}

      {/* SNAPSHOT TRENDS — sparklines over time */}
      <Suspense fallback={null}>
        <SnapshotSparklines clientId={client.id} />
      </Suspense>
        </>
      )}
      {tab === "settings" && (
        <>

      {/* TECH STACK */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -bottom-12 size-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="size-4 text-cyan-300" />
              {t("stack.title")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("stack.body")}
            </p>
          </div>
          <form action={redetectAction}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className=""
            >
              <RotateCw className="size-3" />
              {t("stack.redetect")}
            </Button>
          </form>
        </header>
        <div className="relative p-5">
          {client.techStack && client.techStack.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {client.techStack.map((tech) => (
                <span
                  key={tech}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-foreground/90"
                >
                  <span className="size-1.5 rounded-full bg-gradient-to-br from-cyan-400 to-violet-400" />
                  {tech}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("stack.none")}
            </p>
          )}
        </div>
      </section>

      {/* NICHE */}
      {client.niche && (
        <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />
          <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-violet-300" />
                {t("niche.title")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("niche.bodyBefore")}{" "}
                <span className="font-medium text-foreground">
                  {nicheLabel(client.niche, t)}
                </span>{" "}
                {t("niche.bodyAfter")}
              </p>
            </div>
            <form action={applyTemplatesAction}>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                className=""
              >
                <RotateCw className="size-3" />
                {t("niche.reapply")}
              </Button>
            </form>
          </header>
        </section>
      )}

      {/* TECH-STACK CHECKLIST */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
        <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="size-4 text-cyan-300" />
              {t("checklist.title")}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {matchedStacks.length === 1 && matchedStacks[0] === "custom"
                ? t("checklist.generic")
                : t("checklist.tailored", {
                    stacks: matchedStacks.map((s) => STACK_LABELS[s]).join(" + "),
                  })}
            </p>
          </div>
          <form action={applyStackAction}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className=""
            >
              <RotateCw className="size-3" />
              {t("checklist.reapply")}
            </Button>
          </form>
        </header>
        <div className="relative p-5 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            {matchedStacks.map((s) => (
              <span
                key={s}
                className="rounded-full bg-cyan-500/15 px-2.5 py-1 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30"
              >
                {STACK_LABELS[s]}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs">
            {t("checklist.body")}
          </p>
        </div>
      </section>
        </>
      )}
      {tab === "overview" && (
        <>

      {/* RECENT AUDITS */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="size-4 text-cyan-300" />
            {t("audits.title")}
          </h2>
        </header>
        <div className="relative">
          {recentAudits.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {t("audits.none")}
            </p>
          ) : (
            <ul className="divide-y divide-white/5">
              {recentAudits.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-white/[0.03]"
                >
                  <Link
                    href={`/audits/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {t("audits.item", { id: a.id })}
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      {a.kind === "ai_full"
                        ? t("audits.kind.ai")
                        : a.mode === "full"
                          ? t("audits.kind.full")
                          : a.mode === "quick"
                            ? t("audits.kind.quick")
                            : a.kind === "seomator"
                              ? t("audits.kind.technical")
                              : t("audits.kind.crawl")}
                    </span>
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {t.has(`audits.status.${a.status}`) ? t(`audits.status.${a.status}`) : a.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("audits.issues", { count: a.issuesCount ?? 0 })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(a.completedAt ?? a.createdAt).toLocaleDateString()}
                    </span>
                    <ScoreBadge score={a.score ?? null} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
        </>
      )}
      {tab === "settings" && (
        <>

      <ShareCard
        clientId={client.id}
        shareToken={client.shareToken}
        clientEmail={client.email}
      />

      {/* DANGER ZONE */}
      <section className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-rose-500/5 backdrop-blur-md">
        <header className="border-b border-rose-500/20 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-rose-300">
            <Trash2 className="size-4" />
            {t("danger")}
          </h2>
        </header>
        <div className="p-5">
          <DeleteClientButton
            clientId={client.id}
            clientName={client.name}
            counts={{
              audits: deleteAuditCount,
              auditIssues: deleteAuditIssueCount,
              tasks: deleteTaskCount,
              keywords: clientKeywordIds.length,
              rankings: deleteRankingCount,
              backlinks: deleteBacklinkCount,
              reports: deleteReportCount,
              snapshots: deleteSnapshotCount,
            }}
          />
        </div>
      </section>
        </>
      )}
        </div>
      </div>
    </div>
  );
}
