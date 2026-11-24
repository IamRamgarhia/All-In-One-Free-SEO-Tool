import { getTranslations, getLocale } from "next-intl/server";
import Link from "next/link";
import path from "node:path";
import { statSync, existsSync } from "node:fs";
import {
  Activity,
  Database,
  Clock,
  Bug,
  Cpu,
  Bot,
  CheckCircle2,
  AlertCircle,
  Globe,
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
import { configuredProviders, getActiveProvider } from "@/lib/api-keys";
import { requireSettingsPage } from "../access";
import { InstallHealthSection } from "./install-health-section";
import { shortAgoDays } from "@/lib/relative-time";

export const dynamic = "force-dynamic";

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function HealthPage() {
  await requireSettingsPage("/settings/health");
  const tx = await getTranslations("ui.app_settings_health_page");
  const tTime = await getTranslations("time");
  const locale = await getLocale();
  const fmtAgo = (d: Date | null) =>
    d ? shortAgoDays(Date.now() - d.getTime(), tTime, { seconds: true }) : tTime("never");
  const dbPath = process.env.SEO_DB_PATH ?? path.join(process.cwd(), "data.db");
  const dbAbsolute = path.resolve(dbPath);
  const dbExists = existsSync(dbAbsolute);
  const dbSize = dbExists ? statSync(dbAbsolute).size : 0;

  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);

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

      <PageHeader
        title={tx("systemHealth")}
        description={tx("atAGlanceViewOf")}
        icon={Activity}
        accent="emerald"
      />

      {/* Above the metric cards: "the plugin on your live site does not
          answer" matters more than the database size. The same stored
          result the dashboard banner reads, so the two cannot disagree
          about whether the install is healthy. */}
      <InstallHealthSection />

      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card
          icon={Database}
          title={tx("database")}
          value={fmtBytes(dbSize)}
          subtitle={dbAbsolute}
          tone={dbExists ? "ok" : "error"}
          subtle
        />
        <Card
          icon={Clock}
          title={tx("dailyAgentLastRan")}
          value={fmtAgo(lastDailyAgent)}
          subtitle={lastDailyAgent?.toLocaleString(locale) ?? tx("neverRun")}
          tone={
            lastDailyAgent &&
            now - lastDailyAgent.getTime() < 30 * 60 * 60 * 1000
              ? "ok"
              : "warn"
          }
        />
        <Card
          icon={Bug}
          title={tx("openErrors")}
          value={String(errorCount)}
          subtitle={tx("inLast24h", { errorsLast24h })}
          tone={errorCount === 0 ? "ok" : errorCount < 5 ? "warn" : "error"}
          href="/settings/errors"
          ctaLabel={tx("viewLog")}
        />
        <Card
          icon={Bot}
          title={tx("aiActive")}
          value={activeProvider ?? tx("notSet")}
          subtitle={tx("otherConfigured", { length: configuredProviderIds.length })}
          tone={activeProvider ? "ok" : "warn"}
          href="/settings#ai"
          ctaLabel={tx("manage")}
        />
        <Card
          icon={Cpu}
          title={tx("aiCalls24h")}
          value={String(aiCallsLast24h)}
          subtitle={
            aiErrorsLast24h > 0
              ? tx("failedSeeAiUsageLog", { aiErrorsLast24h })
              : tx("allSucceeded")
          }
          tone={aiErrorsLast24h === 0 ? "ok" : "warn"}
          href="/settings/ai-usage"
          ctaLabel={tx("usageLog")}
        />
        <Card
          icon={Globe}
          title={tx("dataSummary")}
          value={tx("clients", { clientCount })}
          subtitle={tx("keywordsAuditsReportsToolRuns", { keywordCount, auditCount, reportCount, toolRunCount })}
          tone="ok"
        />
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
        <h2 className="mb-3 text-sm font-semibold">{tx("quickActions")}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link
            href="/settings/backup"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">{tx("backupRestore")}</p>
              <p className="text-[11px] text-muted-foreground">
                {tx("downloadRestoreDataDb")}
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
          <Link
            href="/settings/errors"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">{tx("errorLog")}</p>
              <p className="text-[11px] text-muted-foreground">
                {tx("serverBrowserExceptions")}
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
          <Link
            href="/settings/ai-usage"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">{tx("aiUsageLog")}</p>
              <p className="text-[11px] text-muted-foreground">
                {tx("everyAiCallCost")}
              </p>
            </div>
            <span className="text-violet-300">→</span>
          </Link>
          <Link
            href="/automations/overview"
            className="flex items-center justify-between rounded-md bg-white/[0.03] p-3 ring-1 ring-inset ring-white/5 transition-colors hover:bg-white/[0.06]"
          >
            <div>
              <p className="text-sm font-medium">{tx("automationOverview")}</p>
              <p className="text-[11px] text-muted-foreground">
                {tx("whatRunsOnItsOwn")}
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
