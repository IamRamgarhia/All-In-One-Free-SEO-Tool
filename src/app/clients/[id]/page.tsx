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
import { BrandingPreflightBanner } from "./branding-preflight-banner";
import {
  applyNicheTemplates,
  applyStackTemplates,
  redetectTechStack,
  refreshClientMetadataForm,
} from "../actions";
import { pickStackTemplates, STACK_LABELS } from "@/lib/tech-stack-templates";
import { runAuditForClient } from "@/app/audits/actions";
import { ShareCard } from "./share-card";
import { ClientGooglePanel } from "./google-panel";
import { PerClientGoogleConnect } from "./per-client-google";
import { GscKeywordsPanel } from "./gsc-keywords-panel";
import { QuickWinsPanel } from "./quick-wins-panel";
import { SnapshotSparklines } from "@/components/snapshot-sparklines";
import { WpBridgePanel } from "./wp-bridge-panel";
import { OrganicTrafficPanel } from "./organic-traffic-panel";
import { ReportScheduleCard } from "./report-schedule-card";
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
} from "@/db/schema";
import { ClientToolsPanel } from "./client-tools-panel";
import { DeleteClientButton } from "./delete-client-button";
import { DailyAutomationCard } from "./daily-automation-card";
import { inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { Suspense } from "react";
import { Mail, Plug } from "lucide-react";

const nicheLabels: Record<string, string> = {
  local: "Local",
  ecommerce: "E-commerce",
  saas: "SaaS",
  blog: "Blog",
  services: "Services",
};

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
function relativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60 * 60) return "today";
  const hours = Math.floor(seconds / 3600);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 18) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function PanelSkeleton({ title }: { title: string }) {
  return (
    <section className="glass-apple relative overflow-hidden rounded-2xl">
      <header className="relative border-b border-white/[0.06] px-5 py-4">
        <div className="text-sm text-muted-foreground">{title}</div>
      </header>
      <div className="space-y-2 p-5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-white/5" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-white/5" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
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
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isFinite(clientId)) notFound();
  const sp = (await searchParams) ?? {};
  const brandingNeeded = sp["branding-needed"] === "1";
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

  const [latestCompleted] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.clientId, clientId), eq(audits.status, "completed")))
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
  const runAction = runAuditForClient.bind(null, client.id);
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
          client={{
            id: client.id,
            url: client.url,
            gscProperty: client.gscProperty,
            gbpUrl: client.gbpUrl,
            ga4PropertyId: client.ga4PropertyId,
            wpEndpoint: client.wpEndpoint,
          }}
        />

        <div className="min-w-0 flex-1 space-y-6">
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
          ? relativeTime(latestCompleted.completedAt)
          : null;
        const auditedDateFull = latestCompleted?.completedAt
          ? latestCompleted.completedAt.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })
          : null;
        const barFill = score === null ? 0 : Math.max(2, Math.min(100, score));

        return (
          <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            {/* Score-colored masthead stripe */}
            <div
              aria-hidden
              className={`h-px w-full bg-gradient-to-r ${toneClasses.stripe}`}
            />

            <div className="p-6 sm:p-8">
              {/* Breadcrumb — editorial micro caps */}
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
              >
                <Link
                  href="/clients"
                  className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                  Clients
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
                        aria-label={`${client.url} — opens in a new tab`}
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
                        {nicheLabels[client.niche] ?? client.niche}
                      </span>
                    )}
                    {client.techStack && client.techStack.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-border">
                        <Layers className="size-3" />
                        {client.techStack.length} tech
                        {client.techStack.length === 1 ? "" : "s"} detected
                      </span>
                    )}
                    {auditedLabel && latestCompleted?.completedAt && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span
                          aria-hidden
                          className="size-1 rounded-full bg-muted-foreground/50"
                        />
                        <span>
                          Audited{" "}
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
                  aria-label="Latest audit summary"
                >
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    Health score
                  </dt>
                  <dd className="mt-2 flex items-baseline gap-2">
                    <span
                      className={`font-bold tabular-nums leading-none ${toneClasses.number}`}
                      style={{ fontSize: "clamp(4rem, 6vw, 5.5rem)" }}
                      aria-label={
                        score === null
                          ? "No score yet"
                          : `${score} out of 100`
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
                        <span>issues found</span>
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
                        Run an audit to score this site — takes ~30 seconds.
                      </span>
                    )}
                  </dd>
                </dl>
              </div>

              {/* Hairline + action row */}
              <div className="mt-7 border-t border-border pt-5">
                <div className="flex flex-wrap items-center gap-2">
                  {/* HERO action — Run audit */}
                  <form action={runAction}>
                    <SubmitButton
                      icon={<Play className="size-3.5" />}
                      pendingChildren="Running audit…"
                      pendingToast="Starting audit"
                      pendingToastDescription="Crawling the site and running 30+ checks. Takes ~30-60 s."
                    >
                      Run audit
                    </SubmitButton>
                  </form>

                  {/* Generate report dropdown */}
                  <details className="group/rep relative">
                    <summary
                      className={buttonVariants({
                        variant: "outline",
                        className:
                          "list-none cursor-pointer [&::-webkit-details-marker]:hidden",
                      })}
                    >
                      <FileDown className="size-3.5" />
                      Generate report
                    </summary>
                    <div className="absolute left-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                      <Link
                        href={`/reports/${client.id}?template=executive`}
                        className="block px-3 py-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">Executive</div>
                        <div className="text-[11px] text-muted-foreground">
                          Score, summary, top issues — 1 page
                        </div>
                      </Link>
                      <Link
                        href={`/reports/${client.id}?template=detailed`}
                        className="block border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">Detailed</div>
                        <div className="text-[11px] text-muted-foreground">
                          Full report — work done + next steps
                        </div>
                      </Link>
                      <Link
                        href={`/reports/${client.id}?template=technical`}
                        className="block border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <div className="font-medium">Technical</div>
                        <div className="text-[11px] text-muted-foreground">
                          Every issue + URLs — engineering
                        </div>
                      </Link>
                    </div>
                  </details>

                  {/* Primary AI surface */}
                  <Link
                    href={`/clients/${client.id}/ai-audit`}
                    className={buttonVariants({
                      variant: "outline",
                      className: "border-violet-500/30 bg-violet-500/10",
                    })}
                  >
                    <Bot className="size-3.5" />
                    AI audit
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
                        ? "Re-run onboarding to refresh keywords + plan"
                        : "Smart onboarding — auto-generates a 30-day plan"
                    }
                  >
                    <Sparkles className="size-3.5" />
                    {client.onboardingStep === "completed"
                      ? "Re-plan"
                      : "Smart onboarding"}
                  </Link>

                  {/* Overflow — everything else */}
                  <details className="group/more relative ml-auto">
                    <summary
                      className={buttonVariants({
                        variant: "outline",
                        className:
                          "list-none cursor-pointer [&::-webkit-details-marker]:hidden",
                      })}
                    >
                      <MoreHorizontal className="size-3.5" />
                      More
                    </summary>
                    <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
                      <Link
                        href={`/agent/c/${client.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Bot className="size-3.5 text-violet-300" />
                        AI agent
                      </Link>
                      <Link
                        href={`/blog/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Wand2 className="size-3.5 text-violet-300" />
                        AI blog
                      </Link>
                      <Link
                        href={`/guest-posts/c/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Wand2 className="size-3.5 text-amber-300" />
                        Guest posts
                      </Link>
                      <Link
                        href={`/link-building/c/${client.id}`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Link2 className="size-3.5 text-emerald-300" />
                        Backlinks
                      </Link>
                      <Link
                        href={`/clients/${client.id}/edit`}
                        className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Pencil className="size-3.5 text-muted-foreground" />
                        Edit client
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
                          pendingChildren="Refreshing…"
                          pendingToast="Refreshing site metadata"
                          pendingToastDescription="Re-fetching logo, NAP, tech stack…"
                          title="Re-fetch logo, address, social links, and tech stack from the live site"
                          className="w-full justify-start rounded-none px-3 py-2 text-sm font-normal hover:bg-accent"
                        >
                          Refresh metadata
                        </SubmitButton>
                      </form>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* STATS — same StatCard component as dashboard for consistency */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Open issues"
          value={latestCompleted?.issuesCount ?? 0}
          accent="amber"
          icon={AlertCircle}
          hint="From last audit"
        />
        <StatCard
          label="Open tasks"
          value={openTaskCount}
          accent="violet"
          icon={ClipboardList}
          hint="Auto-generated + manual"
        />
        <StatCard
          label="Tracked keywords"
          value={keywordCount}
          accent="cyan"
          icon={Search}
          hint={keywordCount === 0 ? "Not tracking any yet" : "In rotation"}
        />
      </div>

      {/* DAILY AUTOMATION ENTRY — schedules + queue, per client */}
      <DailyAutomationCard clientId={client.id} />

      {/* GOOGLE INTEGRATION */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-violet-500/15 blur-3xl" />
        <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Plug className="size-4 text-violet-300" />
              Google Search Console + Analytics
              {client.gscProperty || client.ga4PropertyId ? (
                <span className="ml-1 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                  Linked
                </span>
              ) : (
                <span className="ml-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
                  Optional
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Real keyword data + traffic for this client. Pick once — runs in
              the background after that.
            </p>
          </div>
        </header>
        <div className="relative p-5 space-y-4">
          <ClientGooglePanel
            clientId={client.id}
            initialGsc={client.gscProperty}
            initialGa4={client.ga4PropertyId}
            status={googleStatus}
            redirectUri={googleRedirectUri}
            initialClientId={googleClientId}
            hasSecret={Boolean(googleClientSecret)}
          />
          <PerClientGoogleConnect
            clientId={client.id}
            connectedEmail={client.googleConnectedEmail}
            hasWorkspaceCreds={
              !!googleClientId && !!googleClientSecret
            }
          />
        </div>
      </section>

      {/* LIVE GOOGLE DATA — only when properties are linked */}
      {googleStatus.configured && client.ga4PropertyId && (
        <Suspense
          fallback={
            <PanelSkeleton title="Loading organic traffic from Analytics…" />
          }
        >
          <OrganicTrafficPanel propertyId={client.ga4PropertyId} />
        </Suspense>
      )}

      {googleStatus.configured && client.gscProperty && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Suspense
            fallback={
              <PanelSkeleton title="Loading top keywords from Search Console…" />
            }
          >
            <GscKeywordsPanel siteUrl={client.gscProperty} />
          </Suspense>
          <Suspense
            fallback={<PanelSkeleton title="Finding quick wins…" />}
          >
            <QuickWinsPanel siteUrl={client.gscProperty} />
          </Suspense>
        </div>
      )}

      {/* SNAPSHOT TRENDS — sparklines over time */}
      <Suspense fallback={null}>
        <SnapshotSparklines clientId={client.id} />
      </Suspense>

      {/* WP one-click bridge */}
      <WpBridgePanel
        clientId={client.id}
        isConnected={Boolean(client.wpEndpoint && client.wpKey)}
        endpoint={client.wpEndpoint ?? null}
      />

      {/* SCHEDULED REPORTS */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -bottom-12 size-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Mail className="size-4 text-cyan-300" />
              Scheduled report email
              {scheduleRow ? (
                <span className="ml-1 inline-flex rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                  Active
                </span>
              ) : (
                <span className="ml-1 inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
                  Optional
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Auto-deliver the branded PDF to client + team on a schedule. Or
              hit &ldquo;Send now&rdquo; below to email it on demand.
            </p>
          </div>
        </header>
        <div className="relative p-5">
          <ReportScheduleCard
            clientId={client.id}
            smtpConfigured={smtpConfigured}
            schedule={
              scheduleRow
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
                : null
            }
          />
        </div>
      </section>

      {/* TECH STACK */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -bottom-12 size-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="size-4 text-cyan-300" />
              Tech stack
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Detected from HTML + HTTP headers — drives every recommendation
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
              Re-detect
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
              Nothing detected yet. The site may have been unreachable when we
              looked — try Re-detect.
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
                Niche tasks
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Starter task list for{" "}
                <span className="font-medium text-foreground">
                  {nicheLabels[client.niche] ?? client.niche}
                </span>{" "}
                — duplicates are skipped on re-apply
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
                Re-apply templates
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
              Tech-stack checklist
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {matchedStacks.length === 1 && matchedStacks[0] === "custom"
                ? "Generic SEO checklist (no major CMS detected)"
                : `Tasks tailored for ${matchedStacks
                    .map((s) => STACK_LABELS[s])
                    .join(" + ")}`}
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
              Re-apply checklist
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
            We auto-applied platform-specific SEO tasks when this client was
            added. Tasks include actionable next steps with the exact plugin /
            setting / step for the detected platform.
          </p>
        </div>
      </section>

      {/* RECENT AUDITS */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-cyan-500/10 blur-3xl" />
        <header className="relative border-b border-white/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="size-4 text-cyan-300" />
            Recent audits
          </h2>
        </header>
        <div className="relative">
          {recentAudits.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              No audits yet. Click Run audit above to do your first one.
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
                    Audit #{a.id}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {a.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {a.issuesCount} issues
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
            Danger zone
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
        </div>
      </div>
    </div>
  );
}
