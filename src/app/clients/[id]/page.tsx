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
import { ScoreGauge } from "@/components/ui/score-gauge";
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
      {/* HERO — shadcn-admin style: flat card, real favicon, no orbs */}
      <section className="rounded-xl border border-border bg-card p-6 shadow">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            href="/clients"
            className="rounded px-1 py-0.5 transition-colors hover:text-foreground"
          >
            Clients
          </Link>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-foreground">{client.name}</span>
        </nav>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <SiteFavicon url={client.url} name={client.name} size={48} />
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  {client.name}
                </h1>
                <a
                  href={client.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  {client.url.replace(/^https?:\/\//, "")}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {client.niche && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${nicheTone[client.niche] ?? "bg-muted text-muted-foreground"}`}
                >
                  <Sparkles className="size-3" />
                  {nicheLabels[client.niche] ?? client.niche}
                </span>
              )}
              {client.techStack && client.techStack.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                  <Layers className="size-3" />
                  {client.techStack.length} techs detected
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
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
                <div className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
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
              <Link
                href={`/agent/c/${client.id}`}
                className={buttonVariants({
                  variant: "outline",
                  className: "border-violet-500/30 bg-violet-500/10",
                })}
              >
                <Bot className="size-3.5" />
                AI agent
              </Link>
              <Link
                href={`/blog/${client.id}`}
                className={buttonVariants({
                  variant: "outline",
                  className: "border-violet-500/30 bg-violet-500/10",
                })}
              >
                <Wand2 className="size-3.5" />
                AI blog
              </Link>
              <Link
                href={`/link-building/c/${client.id}`}
                className={buttonVariants({
                  variant: "outline",
                  className: "border-emerald-500/30 bg-emerald-500/10",
                })}
                title="AI-matched backlink prospects + tracker for this client"
              >
                <Link2 className="size-3.5" />
                Backlinks
              </Link>
              <Link
                href={`/guest-posts/c/${client.id}`}
                className={buttonVariants({
                  variant: "outline",
                  className: "border-amber-500/30 bg-amber-500/10",
                })}
                title="AI guest post composer tuned per platform"
              >
                <Wand2 className="size-3.5" />
                Guest posts
              </Link>
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
              <Link
                href={`/clients/${client.id}/edit`}
                className={buttonVariants({
                  variant: "outline",
                  className: "border-white/10 bg-white/5",
                })}
              >
                <Pencil className="size-3.5" />
                Edit
              </Link>
              <form action={refreshMetadataAction}>
                <SubmitButton
                  variant="outline"
                  icon={<RefreshCw className="size-3.5" />}
                  pendingChildren="Refreshing…"
                  pendingToast="Refreshing site metadata"
                  pendingToastDescription="Re-fetching logo, NAP, tech stack…"
                  title="Re-fetch logo, address, social links, and tech stack from the live site"
                >
                  Refresh
                </SubmitButton>
              </form>
            </div>
          </div>

          {/* Score gauge in hero */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <ScoreGauge score={latestCompleted?.score ?? null} size={120} />
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Latest audit
              </div>
              {latestCompleted ? (
                <>
                  <div className="text-sm font-medium text-foreground">
                    {latestCompleted.completedAt?.toLocaleDateString() ?? "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {latestCompleted.issuesCount} issues found
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Click Run audit to score this site
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

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
