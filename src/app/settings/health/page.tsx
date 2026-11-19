import Link from "next/link";
import path from "node:path";
import { statSync, existsSync } from "node:fs";
import {
  ArrowLeft,
  Activity,
  Database,
  Clock,
  Bug,
  Cpu,
  Bot,
  CheckCircle2,
  AlertCircle,
  Globe,
  Search,
} from "lucide-react";
import { count, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import {
  audits,
  clients,
  keywords,
  systemErrors,
  toolRuns,
  aiCalls,
  reportArchives,
} from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { getSetting } from "@/lib/settings-store";
import { InstallHealthSection } from "./install-health-section";
import { configuredProviders, getActiveProvider } from "@/lib/api-keys";
import { listGscProperties } from "@/lib/google-oauth";
import {
  diagnoseGscProperties,
  describeGscIssue,
  type GscPropertyHealth,
} from "@/lib/gsc-property-health";

export const dynamic = "force-dynamic";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtAgo(d: Date | null): string {
  if (!d) return "never";
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default async function HealthPage() {
  const dbPath = process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
  const dbAbsolute = path.resolve(dbPath);
  const dbExists = existsSync(dbAbsolute);
  const dbSize = dbExists ? statSync(dbAbsolute).size : 0;

  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);

  /**
   * Does every client's saved Search Console property still exist in the
   * connected account?
   *
   * Nothing asked this until now. listGscProperties() runs when you PICK
   * a property and never again, so one that stops being readable keeps
   * being sent to Google forever and every Search Console feature fails
   * one call at a time, with a raw 403 inside whichever tool the user
   * opened. Measured on this install: the account held zero properties
   * while a client still asked for "https://dicecodes.com/".
   *
   * null means Google is not connected at all, which is a different and
   * much less alarming thing than "connected and broken".
   */
  let gscHealth: GscPropertyHealth | null = null;
  try {
    const [available, clientRows] = await Promise.all([
      listGscProperties(),
      db
        .select({
          id: clients.id,
          name: clients.name,
          gscProperty: clients.gscProperty,
        })
        .from(clients),
    ]);
    gscHealth = diagnoseGscProperties(clientRows, available);
  } catch {
    gscHealth = null;
  }

  const [
    [{ value: clientCount }],
    [{ value: keywordCount }],
    [{ value: auditCount }],
    [{ value: reportCount }],
    [{ value: toolRunCount }],
    [{ value: errorCount }],
    [{ value: errorsLast24h }],
    [{ value: aiCallsLast24h }],
    [{ value: aiErrorsLast24h }],
    lastDailyAgentRaw,
    activeProvider,
    { ids: configuredProviderIds },
  ] = await Promise.all([
    db.select({ value: count() }).from(clients),
    db.select({ value: count() }).from(keywords),
    db.select({ value: count() }).from(audits),
    db.select({ value: count() }).from(reportArchives),
    db.select({ value: count() }).from(toolRuns),
    db.select({ value: count() }).from(systemErrors).where(eq(systemErrors.resolved, false)),
    db
      .select({ value: count() })
      .from(systemErrors)
      .where(gte(systemErrors.lastSeenAt, last24h)),
    db
      .select({ value: count() })
      .from(aiCalls)
      .where(gte(aiCalls.createdAt, last24h)),
    db
      .select({ value: count() })
      .from(aiCalls)
      .where(eq(aiCalls.status, "error")),
    getSetting<number>("daily_agent_runner.last_run").catch(() => null),
    getActiveProvider().catch(() => null),
    configuredProviders().catch(() => ({ ids: [], byId: {} })),
  ]);

  const lastDailyAgent =
    typeof lastDailyAgentRaw === "number" ? new Date(lastDailyAgentRaw) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Back to settings
      </Link>

      <PageHeader
        title="System health"
        description="At-a-glance view of where things stand: database size, last agent run, error count, AI provider status. Anything red below means there's something to look at."
        icon={Activity}
        accent="emerald"
      />

      {/* Above the metric cards, because "the plugin on your live site
          has not answered for 68 days" matters more than the database
          size, and this page used to lead with the database size. The
          same stored result the dashboard banner reads, so the two
          cannot disagree about whether the install is healthy. */}
      <InstallHealthSection />

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card
          icon={Database}
          title="Database"
          value={fmtBytes(dbSize)}
          subtitle={dbAbsolute}
          tone={dbExists ? "ok" : "error"}
          subtle
        />
        <Card
          icon={Clock}
          title="Daily agent last ran"
          value={fmtAgo(lastDailyAgent)}
          subtitle={lastDailyAgent?.toLocaleString() ?? "Never run"}
          tone={
            lastDailyAgent &&
            now - lastDailyAgent.getTime() < 30 * 60 * 60 * 1000
              ? "ok"
              : "warn"
          }
        />
        <Card
          icon={Bug}
          title="Open errors"
          value={String(errorCount)}
          subtitle={`${errorsLast24h} in last 24h`}
          tone={errorCount === 0 ? "ok" : errorCount < 5 ? "warn" : "error"}
          href="/settings/errors"
          ctaLabel="View log"
        />
        <Card
          icon={Bot}
          title="AI active"
          value={activeProvider ?? "Not set"}
          subtitle={`${configuredProviderIds.length} provider${configuredProviderIds.length === 1 ? "" : "s"} configured`}
          tone={activeProvider ? "ok" : "warn"}
          href="/settings#ai"
          ctaLabel="Manage"
        />
        <Card
          icon={Cpu}
          title="AI calls (24h)"
          value={String(aiCallsLast24h)}
          subtitle={
            aiErrorsLast24h > 0
              ? `${aiErrorsLast24h} failed — see AI usage log`
              : "All succeeded"
          }
          tone={aiErrorsLast24h === 0 ? "ok" : "warn"}
          href="/settings/ai-usage"
          ctaLabel="Usage log"
        />
        <Card
          icon={Globe}
          title="Data summary"
          value={`${clientCount} clients`}
          subtitle={`${keywordCount} keywords · ${auditCount} audits · ${reportCount} reports · ${toolRunCount} tool runs`}
          tone="ok"
        />
        <Card
          icon={Search}
          title="Search Console"
          value={
            gscHealth === null
              ? "Not connected"
              : gscHealth.issues.length > 0
                ? `${gscHealth.issues.length} broken`
                : `${gscHealth.okCount} connected`
          }
          subtitle={
            gscHealth === null
              ? "No Google account connected, or the token has expired"
              : gscHealth.issues.length > 0
                ? describeGscIssue(gscHealth.issues[0])
                : `${gscHealth.unsetCount} client${gscHealth.unsetCount === 1 ? "" : "s"} without a property`
          }
          tone={
            gscHealth === null
              ? "warn"
              : gscHealth.issues.length > 0
                ? "error"
                : "ok"
          }
          href="/connect"
          ctaLabel="Fix"
        />
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold">Quick actions</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/settings/backup"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">Backup &amp; restore</p>
              <p className="text-[11px] text-muted-foreground">
                Download / restore data.db
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
          <Link
            href="/settings/errors"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">Error log</p>
              <p className="text-[11px] text-muted-foreground">
                Server + browser exceptions
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
          <Link
            href="/settings/ai-usage"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">AI usage log</p>
              <p className="text-[11px] text-muted-foreground">
                Every AI call + cost
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
          <Link
            href="/automations/overview"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">Automation overview</p>
              <p className="text-[11px] text-muted-foreground">
                What runs on its own
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  value,
  subtitle,
  tone,
  subtle,
  href,
  ctaLabel,
}: {
  icon: typeof Activity;
  title: string;
  value: string;
  subtitle?: string;
  tone: "ok" | "warn" | "error";
  subtle?: boolean;
  href?: string;
  ctaLabel?: string;
}) {
  const toneStyles =
    tone === "ok"
      ? "ring-emerald-500/20 bg-emerald-500/[0.04]"
      : tone === "warn"
        ? "ring-amber-500/20 bg-amber-500/[0.04]"
        : "ring-rose-500/20 bg-rose-500/[0.04]";

  const Status =
    tone === "ok" ? CheckCircle2 : tone === "warn" ? AlertCircle : AlertCircle;
  const statusTone =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-rose-300";

  return (
    <div className={`rounded-2xl p-4 ring-1 ring-inset ${toneStyles}`}>
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          <span>{title}</span>
        </div>
        <Status className={`size-3.5 ${statusTone}`} />
      </header>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      {subtitle && (
        <p
          className={
            subtle
              ? "mt-0.5 truncate text-[10px] font-mono text-muted-foreground"
              : "mt-0.5 text-[11px] text-muted-foreground"
          }
          title={subtle ? subtitle : undefined}
        >
          {subtitle}
        </p>
      )}
      {href && ctaLabel && (
        <Link
          href={href}
          className="mt-2 inline-flex text-[11px] font-medium text-violet-300 hover:underline"
        >
          {ctaLabel} →
        </Link>
      )}
    </div>
  );
}
