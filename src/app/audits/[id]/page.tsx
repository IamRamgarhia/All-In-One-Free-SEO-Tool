import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileDown,
  Info,
  Loader2,
} from "lucide-react";
import { db } from "@/db/client";
import { audits, auditIssues, clients } from "@/db/schema";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Term } from "@/components/ui/term";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { FixWizard } from "@/components/fix-wizard";
import { IssueExplainer } from "@/components/issue-explainer";
import { AskAiButton } from "@/components/ask-ai-button";
import { getExplainer } from "@/lib/issue-explainers.server";
import { isFixable } from "@/lib/fix-suggestions";
import { confidenceReason } from "@/lib/audit-confidence";
import {
  categoryLabel,
  extractCwv,
  extractScoreCap,
  extractWaivedCaps,
  ruleDisplayName,
  verdictForScore,
} from "@/lib/seomator-meta";
import { getTranslations } from "next-intl/server";
import { setStatusForType } from "../issue-actions";
import { SeomatorAuditProgressLive } from "@/components/audits/seomator-audit-progress";
import { SeomatorGeoPanel } from "@/components/audits/seomator-geo-panel";
import { GeoAuditPanel } from "@/components/audits/geo-audit-panel";
import { EngineReportView } from "@/components/audits/engine-report";
import { buildEngineReport, isEngineReport } from "@/lib/engine-report";
import { isSiteKind } from "@/lib/advisory-rules";

// Map audit issue-types to the glossary term key.
const issueTypeToTerm: Record<string, string> = {
  missing_title: "title",
  short_title: "title",
  long_title: "title",
  duplicate_title: "title",
  missing_meta_description: "meta description",
  short_meta_description: "meta description",
  long_meta_description: "meta description",
  duplicate_meta_description: "meta description",
  missing_canonical: "canonical",
  missing_viewport: "viewport",
  noindex_set: "noindex",
  missing_schema: "schema",
  missing_og_tags: "open graph",
  missing_robots_txt: "robots.txt",
  invalid_robots_txt: "robots.txt",
  missing_sitemap: "sitemap",
  inconsistent_hreflang: "hreflang",
  missing_security_headers: "csp",
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 } as const;

const sevConfig: Record<
  "critical" | "high" | "medium" | "low",
  {
    iconBg: string;
    iconText: string;
    icon: typeof AlertCircle;
    pill: string;
    accent: string;
  }
> = {
  critical: {
    iconBg: "bg-rose-500/15 ring-rose-400/30",
    iconText: "text-rose-300",
    icon: AlertCircle,
    pill: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    accent: "from-rose-500/25",
  },
  high: {
    iconBg: "bg-rose-500/10 ring-rose-400/20",
    iconText: "text-rose-300",
    icon: AlertTriangle,
    pill: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    accent: "from-rose-500/15",
  },
  medium: {
    iconBg: "bg-amber-500/15 ring-amber-400/30",
    iconText: "text-amber-300",
    icon: AlertTriangle,
    pill: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    accent: "from-amber-500/15",
  },
  low: {
    iconBg: "bg-cyan-500/15 ring-cyan-400/30",
    iconText: "text-cyan-300",
    icon: Info,
    pill: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
    accent: "from-cyan-500/15",
  },
};

export default async function AuditDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auditId = Number(id);
  if (!Number.isFinite(auditId)) notFound();

  const t = await getTranslations("audits.detail");
  const tr = await getTranslations("audits.report");
  const tu = await getTranslations("auditUi.detail");
  const tSev = await getTranslations("auditUi.severity");
  const tAsk = await getTranslations("askAi");
  const tCat = await getTranslations("auditUi.categories");
  const tVerdict = await getTranslations("auditUi.verdict");
  const tStatus = await getTranslations("audits.status");
  const catName = (id: string) => (tCat.has(id) ? tCat(id) : categoryLabel(id));

  // `stalledSeconds` is computed by SQLite rather than with Date.now()
  // in the component. Two reasons: React 19's purity rule correctly
  // refuses an impure call during render, and the database is already
  // the authority on when this row started — asking it for the age too
  // means one clock instead of two.
  const [audit] = await db
    .select({
      id: audits.id,
      clientId: audits.clientId,
      status: audits.status,
      score: audits.score,
      issuesCount: audits.issuesCount,
      pagesCrawled: audits.pagesCrawled,
      kind: audits.kind,
      mode: audits.mode,
      targetUrl: audits.targetUrl,
      summary: audits.summary,
      categoryScores: audits.categoryScores,
      geoScore: audits.geoScore,
      geoEnvelopeJson: audits.geoEnvelopeJson,
      rawReport: audits.rawReport,
      previewScreenshotPath: audits.previewScreenshotPath,
      startedAt: audits.startedAt,
      completedAt: audits.completedAt,
      createdAt: audits.createdAt,
      ageSeconds: sql<number>`unixepoch() - unixepoch(${audits.startedAt})`,
    })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  if (!audit) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, audit.clientId))
    .limit(1);
  if (!client) notFound();

  // Nothing reports progress mid-crawl, so age is the only signal we
  // have for "this stopped" versus "this is still going". Kept in step
  // with STALLED_AFTER_MS in src/app/audits/actions.ts, which is what
  // decides whether a new run takes over from this one.
  const isStalled = audit.status === "running" && (audit.ageSeconds ?? 0) > 600;

  const allIssues = await db
    .select()
    .from(auditIssues)
    .where(eq(auditIssues.auditId, auditId))
    .orderBy(asc(auditIssues.severity));

  // Only show non-active issues if user explicitly toggles a filter; for now
  // the main view shows everything except resolved/ignored/false-positive.
  const issues = allIssues.filter((i) => i.status === "new");
  const closedCount = allIssues.length - issues.length;

  // The engine's full per-rule report, drawn like SEOmator's. When it is
  // there, its findings are shown by rule and category, and the list
  // further down keeps only SEO Tool's own checks.
  const report =
    (audit.kind === "seomator" || audit.rawReport != null) &&
    audit.status === "completed" &&
    isEngineReport(audit.rawReport)
      ? buildEngineReport(audit.rawReport, 10, isSiteKind(client?.niche) ? client.niche : null)
      : null;
  const listed = report
    ? issues.filter((i) => !i.type.startsWith("seomator:"))
    : issues;

  const sorted = [...listed].sort(
    (a, b) =>
      severityOrder[a.severity as keyof typeof severityOrder] -
      severityOrder[b.severity as keyof typeof severityOrder],
  );

  // Group repeating issue types within each severity to keep the page tidy.
  // Confidence is captured per-group: we take the strongest level seen
  // for that type (definitely > probably > test). Mixed-confidence
  // groups inherit the strongest reading so a single objective failure
  // isn't downgraded by adjacent heuristic flags.
  type Group = {
    severity: "critical" | "high" | "medium" | "low";
    type: string;
    sample: string;
    affectedUrls: string[];
    issueIds: number[];
    confidence: "definitely" | "probably" | "test" | null;
    aiGenerated: boolean;
    category: string | null;
    fixSteps: string | null;
  };
  const CONF_RANK: Record<string, number> = { definitely: 3, probably: 2, test: 1 };
  function groupByType(issues: typeof sorted): Group[] {
    const map = new Map<string, Group>();
    for (const i of issues) {
      const key = `${i.severity}:${i.type}`;
      const existing = map.get(key);
      const iConf = (i as { confidence?: "definitely" | "probably" | "test" | null }).confidence ?? null;
      const iAi = (i as { aiGenerated?: boolean }).aiGenerated ?? false;
      if (existing) {
        existing.affectedUrls.push(i.url);
        existing.issueIds.push(i.id);
        if (
          iConf &&
          (!existing.confidence ||
            CONF_RANK[iConf] > CONF_RANK[existing.confidence])
        ) {
          existing.confidence = iConf;
        }
        if (!existing.fixSteps && i.fixSteps) {
          existing.fixSteps = i.fixSteps;
        }
      } else {
        map.set(key, {
          severity: i.severity as Group["severity"],
          type: i.type,
          sample: i.message,
          affectedUrls: [i.url],
          issueIds: [i.id],
          confidence: iConf,
          aiGenerated: iAi,
          category: i.category ?? null,
          fixSteps: i.fixSteps ?? null,
        });
      }
    }
    return Array.from(map.values());
  }

  const grouped = {
    critical: groupByType(sorted.filter((i) => i.severity === "critical")),
    high: groupByType(sorted.filter((i) => i.severity === "high")),
    medium: groupByType(sorted.filter((i) => i.severity === "medium")),
    low: groupByType(sorted.filter((i) => i.severity === "low")),
  };

  // How many pages the crawl actually visited, as recorded by the
  // crawler. This used to be derived as `new Set(issues.map(i => i.url)).size`
  // — the number of pages WITH FINDINGS — which meant a healthy 50-page
  // site with three problem pages reported "3 pages", and the better the
  // site got the smaller the number became. Null for audits that predate
  // the column; the UI shows the affected-page count instead and says so.
  const pagesCrawled = audit.pagesCrawled;
  const pagesWithIssues = new Set(issues.map((i) => i.url)).size;
  // The rule engine's reading: every site audit since it joined the
  // crawl (with a mode), and the separate SEOmator audits from before.
  const hasEngine = audit.kind === "seomator" || audit.rawReport != null;
  const tracksProgress = audit.kind === "seomator" || audit.mode != null;
  const cwvRaw = hasEngine ? extractCwv(audit.rawReport) : null;
  // A quick audit takes no browser readings; an all-dashes panel says nothing.
  const cwv =
    cwvRaw && [cwvRaw.lcp, cwvRaw.cls, cwvRaw.inp, cwvRaw.ttfb, cwvRaw.fcp].some((v) => v != null)
      ? cwvRaw
      : null;
  const scoreCap = hasEngine ? extractScoreCap(audit.rawReport) : null;
  const waivedCaps = hasEngine ? extractWaivedCaps(audit.rawReport) : [];
  const verdict =
    hasEngine && audit.score != null ? verdictForScore(audit.score) : null;

  const geoIssues = issues
    .filter(
      (i) =>
        i.category === "geo" ||
        (typeof i.type === "string" &&
          (i.type.startsWith("geo:") || i.type.startsWith("seomator:geo-"))),
    )
    .map((i) => ({
      type: i.type,
      severity: i.severity,
      message: i.message,
      url: i.url,
    }));

  const showLandingPreview =
    hasEngine &&
    audit.status === "completed" &&
    Boolean(audit.previewScreenshotPath);

  const sourceBadge = (
    <DataSourceBadge
      source="crawl"
      asOf={audit.completedAt}
      note={
        hasEngine
          ? pagesCrawled !== null
            ? t("sourceEngineCrawl", { count: pagesCrawled })
            : t("sourceEngine")
          : pagesCrawled !== null
            ? t("sourceCrawl", { count: pagesCrawled })
            : t("sourceLegacy")
      }
    />
  );

  const measured = (
    <>
      {scoreCap ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-amber-100">
          {t("scoreCapped", {
            score: audit.score ?? 0,
            uncapped: scoreCap.uncappedScore,
            reasons: scoreCap.reasons.join("; "),
          })}
        </div>
      ) : null}
      {waivedCaps.length > 0 ? (
        <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-100">
          {t("capsWaived", { caps: waivedCaps.join("; ") })}
        </div>
      ) : null}

      {cwv ? (
        <section className="rounded-2xl border border-white/5 bg-card/40 px-5 py-4 backdrop-blur-md">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("cwvTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("cwvHint")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {(
              [
                ["LCP", cwv.lcp, "cwv-lcp", (v: number) => `${(v / 1000).toFixed(2)}s`],
                ["CLS", cwv.cls, "cwv-cls", (v: number) => v.toFixed(3)],
                ["INP", cwv.inp, "cwv-inp", (v: number) => `${Math.round(v)}ms`],
                ["TTFB", cwv.ttfb, "cwv-ttfb", (v: number) => `${Math.round(v)}ms`],
                ["FCP", cwv.fcp, "cwv-fcp", (v: number) => `${(v / 1000).toFixed(2)}s`],
              ] as const
            ).map(([label, value, ruleId, fmt]) => {
              const status = cwv.statuses[ruleId] ?? "not-measured";
              const tone =
                status === "pass"
                  ? "text-emerald-300"
                  : status === "fail"
                    ? "text-rose-300"
                    : status === "warn"
                      ? "text-amber-300"
                      : "text-muted-foreground";
              return (
                <div
                  key={label}
                  className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
                >
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {label}
                  </div>
                  <div className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>
                    {value == null ? "—" : fmt(value)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {status === "pass" || status === "warn" || status === "fail"
                      ? tu(`cwvStatus.${status}`)
                      : status === "not-measured"
                        ? tu("cwvStatus.notMeasured")
                        : status}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );

  const landingPreview = showLandingPreview ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/audits/${auditId}/preview`}
            alt={t("previewAlt", { url: client.url })}
            className="aspect-[16/10] w-full object-cover object-top"
          />
          <p className="border-t border-white/5 px-4 py-2 text-xs text-muted-foreground">
            {t("landingCaption")}
          </p>
        </section>
      ) : null;

  const geoPanel = audit.status === "completed" &&
      (audit.geoScore != null || audit.geoEnvelopeJson) ? (
        <GeoAuditPanel
          geoScore={audit.geoScore}
          envelope={audit.geoEnvelopeJson}
        />
      ) : null;

  // SEO Tool's own findings: the ones that feed tasks and the agent.
  const checks = (
    <>
      {closedCount > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-200">
          {tu("closedNotice", { count: closedCount })}
        </div>
      )}

      {/* SEVERITY STATS */}
      <div className="grid gap-3 sm:grid-cols-4">
        {(["critical", "high", "medium", "low"] as const).map((sev) => {
          const cfg = sevConfig[sev];
          const Icon = cfg.icon;
          const list = grouped[sev];
          const totalOccurrences = list.reduce(
            (s, g) => s + g.affectedUrls.length,
            0,
          );
          return (
            <div
              key={sev}
              className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
            >
              <div
                className={`pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-gradient-to-br ${cfg.accent} to-transparent blur-3xl`}
              />
              <div className="relative flex items-center justify-between">
                <div
                  className={`flex size-9 items-center justify-center rounded-xl ring-1 ${cfg.iconBg}`}
                >
                  <Icon className={`size-4 ${cfg.iconText}`} />
                </div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {tSev(sev)}
                </div>
              </div>
              <div className="relative mt-3 text-3xl font-semibold tracking-tight">
                {totalOccurrences}
              </div>
              {list.length > 0 && (
                <div className="relative mt-1 text-[10px] text-muted-foreground">
                  {tu("typesCount", { count: list.length })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* TASKS LINK */}
      {listed.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-violet-500/10 via-card/40 to-amber-500/5 px-5 py-4 backdrop-blur-md">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span>
                {tu.rich("autoTasks", {
                  count: [...grouped.critical, ...grouped.high, ...grouped.medium]
                    .length,
                  b: (chunks) => <span className="font-semibold">{chunks}</span>,
                })}
              </span>
            </div>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
            >
              {tu("openTasks")}
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </section>
      )}

      {/* ISSUES BY SEVERITY */}
      {(["critical", "high", "medium", "low"] as const).map((sev) => {
        const list = grouped[sev];
        if (list.length === 0) return null;
        const cfg = sevConfig[sev];
        const Icon = cfg.icon;
        const totalAffected = list.reduce(
          (s, g) => s + g.affectedUrls.length,
          0,
        );
        return (
          <section
            key={sev}
            className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
          >
            <div
              className={`pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-gradient-to-br ${cfg.accent} to-transparent blur-3xl`}
            />
            <header className="relative flex items-center gap-3 border-b border-white/5 px-5 py-4">
              <div
                className={`flex size-9 items-center justify-center rounded-xl ring-1 ${cfg.iconBg}`}
              >
                <Icon className={`size-4 ${cfg.iconText}`} />
              </div>
              <div>
                <h2 className="text-base font-semibold">{tSev(sev)}</h2>
                <p className="text-xs text-muted-foreground">
                  {tu("groupMeta", { types: list.length, occurrences: totalAffected })}
                </p>
              </div>
            </header>
            <ul className="relative divide-y divide-white/5">
              {list.map((g) => (
                <li key={g.type} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {issueTypeToTerm[g.type] ? (
                          <Term term={issueTypeToTerm[g.type]}>
                            <span className="font-medium capitalize">
                              {g.type.replace(/_/g, " ")}
                            </span>
                          </Term>
                        ) : (
                          <span className="font-medium capitalize">
                            {g.type.startsWith("seomator:")
                              ? ruleDisplayName(
                                  g.type.slice("seomator:".length),
                                )
                              : g.type.replace(/_/g, " ")}
                          </span>
                        )}
                        {g.category && (
                          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30">
                            {catName(g.category)}
                          </span>
                        )}
                        {g.affectedUrls.length > 1 && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
                            {tu("pagesCount", { count: g.affectedUrls.length })}
                          </span>
                        )}
                        {g.confidence && (
                          <ConfidenceBadge
                            level={g.confidence}
                            reason={confidenceReason(
                              g.confidence,
                              g.type,
                              g.aiGenerated,
                            )}
                          />
                        )}
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {g.sample}
                      </p>
                      {g.fixSteps ? (
                        <p className="mt-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs leading-relaxed text-cyan-100/90">
                          <span className="font-semibold text-cyan-200">
                            {tu("fixLabel")}{" "}
                          </span>
                          {g.fixSteps}
                        </p>
                      ) : null}
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          {tu("showUrls", { count: g.affectedUrls.length })}
                        </summary>
                        <ul className="mt-2 space-y-0.5 border-l border-white/10 pl-3 text-xs text-muted-foreground">
                          {g.affectedUrls.slice(0, 25).map((u, i) => (
                            <li key={i} className="truncate">
                              {u}
                            </li>
                          ))}
                          {g.affectedUrls.length > 25 && (
                            <li className="text-[11px] italic">
                              {tu("more", { count: g.affectedUrls.length - 25 })}
                            </li>
                          )}
                        </ul>
                      </details>

                      <div className="mt-2 flex flex-wrap items-start gap-2">
                        <AskAiButton
                          clientId={client.id}
                          question={tAsk("issue")}
                          context={tAsk("issueContext", {
                            type: g.type,
                            severity: g.severity,
                            count: g.affectedUrls.length,
                            sample: g.sample.slice(0, 400),
                            urls: g.affectedUrls.slice(0, 5).join(", "),
                          })}
                        />
                        <IssueExplainer
                          issueType={g.type}
                          url={g.affectedUrls[0]}
                          explainer={
                            // Built-in guides carry functions (externalTool),
                            // which cannot cross to a client component; the
                            // component looks those up itself.
                            g.type.startsWith("seomator:")
                              ? getExplainer(g.type)
                              : undefined
                          }
                        />
                      </div>

                      {isFixable(g.type) && g.affectedUrls.length > 0 && (
                        <FixWizard
                          issueType={g.type}
                          pageUrl={g.affectedUrls[0]}
                          clientId={client.id}
                          wpBridgeConnected={Boolean(
                            client.wpEndpoint && client.wpKey,
                          )}
                        />
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                        <form
                          action={setStatusForType.bind(
                            null,
                            auditId,
                            g.type,
                            "resolved",
                          )}
                        >
                          <button
                            type="submit"
                            className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20"
                          >
                            {tr("markResolved")}
                          </button>
                        </form>
                        <form
                          action={setStatusForType.bind(
                            null,
                            auditId,
                            g.type,
                            "ignored",
                          )}
                        >
                          <button
                            type="submit"
                            className="rounded-md bg-white/5 px-2 py-1 font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                          >
                            {tr("ignore")}
                          </button>
                        </form>
                        <form
                          action={setStatusForType.bind(
                            null,
                            auditId,
                            g.type,
                            "false_positive",
                          )}
                        >
                          <button
                            type="submit"
                            className="rounded-md bg-white/5 px-2 py-1 font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10"
                          >
                            {tu("falsePositive")}
                          </button>
                        </form>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.pill}`}
                    >
                      {tSev(sev)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );

  const kindLabel =
    audit.kind === "seomator"
      ? t("seomatorKind")
      : audit.kind === "ai_full"
        ? t("aiKind")
        : audit.mode === "full"
          ? t("fullKind")
          : audit.mode === "quick"
            ? t("quickKind")
            : t("crawlerKind");
  const crumb = "rounded px-1 py-0.5 transition-colors hover:bg-white/10 hover:text-white";
  const reportBreadcrumb = (
    <>
      <Link href="/clients" className={crumb}>
        {t("breadcrumbClients")}
      </Link>
      <span>/</span>
      <Link href={`/clients/${client.id}`} className={`${crumb} truncate`}>
        {client.name}
      </Link>
      <span>/</span>
      <span className="shrink-0 text-white">{t("auditNumber", { id: audit.id })}</span>
    </>
  );
  const ghostBtn =
    "inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/10";
  const reportActions = (
    <>
      <Link
        href={`/audits/${auditId}/export?format=markdown`}
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition-opacity hover:opacity-90"
      >
        <FileDown className="size-4" />
        {t("exportMarkdown")}
      </Link>
      <Link href={`/audits/${auditId}/export?format=llm`} className={ghostBtn}>
        {t("exportLlm")}
      </Link>
      <Link href={`/clients/${client.id}`} className={ghostBtn}>
        <ExternalLink className="size-3.5" />
        {t("viewClient")}
      </Link>
      <Link href={`/audits/c/${client.id}`} className={ghostBtn}>
        {t("allAudits")}
      </Link>
    </>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {report ? null : (
        <>
          {/* HERO */}
          <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 px-6 py-7 backdrop-blur-md">
            <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/15 blur-[100px]" />
            <div className="pointer-events-none absolute -right-16 -bottom-16 size-56 rounded-full bg-fuchsia-500/15 blur-[80px]" />

            <nav className="relative flex items-center gap-1 text-xs text-muted-foreground">
              <Link
                href="/clients"
                className="rounded px-1 py-0.5 transition-colors hover:bg-white/5 hover:text-foreground"
              >
                {t("breadcrumbClients")}
              </Link>
              <span>/</span>
              <Link
                href={`/clients/${client.id}`}
                className="rounded px-1 py-0.5 transition-colors hover:bg-white/5 hover:text-foreground"
              >
                {client.name}
              </Link>
              <span>/</span>
              <span className="text-foreground">{t("auditNumber", { id: audit.id })}</span>
            </nav>

            <div className="relative z-10 mt-4 grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
                    <ClipboardList className="size-5 text-cyan-300" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">
                      <span className="text-gradient-brand">{t("resultsTitle")}</span>
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {audit.completedAt
                        ? t("completedAt", {
                            date: audit.completedAt.toLocaleString(),
                          })
                        : t("startedAt", {
                            date: (audit.startedAt ?? audit.createdAt).toLocaleString(),
                          })}{" "}
                      · {client.name}
                      {" · "}
                      {kindLabel}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/clients/${client.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                  >
                    <ExternalLink className="size-3" />
                    {t("viewClient")}
                  </Link>
                  {hasEngine && audit.status === "completed" ? (
                    <>
                      <Link
                        href={`/audits/${auditId}/export?format=markdown`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                      >
                        {t("exportMarkdown")}
                      </Link>
                      <Link
                        href={`/audits/${auditId}/export?format=llm`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                      >
                        {t("exportLlm")}
                      </Link>
                      <Link
                        href={`/audits/c/${client.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                      >
                        {t("allAudits")}
                      </Link>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="relative flex w-full flex-col items-center gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur sm:flex-row sm:gap-5 sm:p-5 md:w-auto">
                <div className="origin-center scale-90 sm:scale-100">
                  <ScoreGauge score={audit.score ?? null} size={140} label={t("healthScore")} />
                </div>
                <div className="space-y-1.5">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {t("healthScore")}
                  </div>
                  <div className="text-sm font-medium">
                    {pagesCrawled !== null
                      ? t("issuesAcrossPages", { issues: audit.issuesCount, pages: pagesCrawled })
                      : t("issuesOnPages", { issues: audit.issuesCount, pages: pagesWithIssues })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {audit.status === "completed"
                      ? verdict
                        ? `${verdict.grade} · ${tVerdict.has(verdict.grade) ? tVerdict(verdict.grade) : verdict.label}`
                        : t("outOf100")
                      : tStatus.has(audit.status)
                        ? tStatus(audit.status)
                        : audit.status}
                  </div>
                  {/* The number most likely to end up in front of a client,
                      and the one whose basis is least obvious. It describes
                      what our crawler saw on the pages it reached — not
                      what Google has indexed, and not every page on the
                      site. */}
                  {sourceBadge}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      {report ? (
        <EngineReportView
          report={report}
          auditId={auditId}
          activeTypes={new Set(issues.map((i) => i.type))}
          pagesCrawled={pagesCrawled}
          issuesCount={audit.issuesCount}
          badge={sourceBadge}
          afterSnapshot={measured}
          hero={{
            breadcrumb: reportBreadcrumb,
            actions: reportActions,
            kindLabel,
            completedAt: audit.completedAt,
            screenshotSrc: showLandingPreview ? `/audits/${auditId}/preview` : null,
            geoScore: audit.geoScore ?? null,
          }}
          extra={[
            ...(geoPanel ? [{ id: "geo", label: tr("navGeo"), content: geoPanel }] : []),
            {
              id: "checks",
              label: tr("navChecks"),
              count: listed.length,
              content: (
                <>
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight">{tr("seoToolChecks")}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{tr("seoToolChecksHint")}</p>
                  </div>
                  {checks}
                </>
              ),
            },
          ]}
        />
      ) : null}

      {report ? null : landingPreview}


      {!report ? measured : null}

      {!report && hasEngine && audit.status === "completed" ? (
        <SeomatorGeoPanel
          categoryScores={audit.categoryScores}
          geoIssues={geoIssues}
        />
      ) : null}

      {report ? null : geoPanel}

      {report ? null : hasEngine && audit.categoryScores ? (
        <section className="rounded-2xl border border-white/5 bg-card/40 px-5 py-4 backdrop-blur-md">
          <h2 className="text-sm font-semibold tracking-tight">
            {t("categoryScores")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("categoryScoresHint")}
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(audit.categoryScores)
              .sort(([, a], [, b]) => a.score - b.score)
              .map(([cat, vals]) => {
                const tone =
                  vals.fail > 0
                    ? "text-rose-300"
                    : vals.warn > 0
                      ? "text-amber-300"
                      : "text-emerald-300";
                return (
                  <div
                    key={cat}
                    className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
                        {catName(cat)}
                      </span>
                      <span className={`text-lg font-semibold tabular-nums ${tone}`}>
                        {vals.score}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
                      <span>{tu("passCount", { count: vals.pass })}</span>
                      <span>{tu("warnCount", { count: vals.warn })}</span>
                      <span>{tu("failCount", { count: vals.fail })}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      ) : hasEngine && audit.summary ? (
        <section className="rounded-2xl border border-white/5 bg-card/40 px-5 py-4 backdrop-blur-md">
          <h2 className="text-sm font-semibold tracking-tight">
            {tu("categoryBreakdown")}
          </h2>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
            {audit.summary}
          </pre>
        </section>
      ) : null}

      {report ? null : checks}

      {issues.length === 0 && !report && audit.status === "completed" && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-12 text-center backdrop-blur-md">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
              <CheckCircle2 className="size-6 text-emerald-300" />
            </div>
            <h2 className="text-lg font-semibold">{tu("allClear")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("noIssues", { score: audit.score ?? 0 })}
            </p>
          </div>
        </div>
      )}

      {/*
        The running state. This page had branches for "completed" and
        "failed" and nothing for "running", so an audit in progress —
        or one left stuck by a restart — rendered an empty shell: no
        issues, no "all clear", no error. The user's own words for it
        were "it just stops in this place and doesn't go anywhere".

        Auto-refreshes, because an audit finishing is not something the
        user can trigger and a page that never updates looks broken.
      */}
      {audit.status === "running" && tracksProgress ? (
        <div className="space-y-4">
          <SeomatorAuditProgressLive
            auditId={auditId}
            targetUrl={audit.targetUrl ?? client.url}
            initialPagesCrawled={pagesCrawled}
            showPreview={audit.mode !== "quick"}
          />
          {isStalled ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
              <p className="text-sm font-medium text-amber-200">
                {tu("stalledTitle")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {tu("stalledHint")}
              </p>
              <Link
                href={`/clients/${audit.clientId}`}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-200 hover:underline"
              >
                {tu("goToClient")}
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {audit.status === "running" && !tracksProgress ? (
        <div className="relative overflow-hidden rounded-2xl border border-sky-500/20 bg-sky-500/5 px-6 py-12 text-center backdrop-blur-md">
          <meta httpEquiv="refresh" content="10" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/15 ring-1 ring-sky-400/30">
              <Loader2 className="size-6 animate-spin text-sky-300" />
            </div>
            <h2 className="text-lg font-semibold">{t("inProgress")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("inProgressHint", { url: client.url })}
            </p>
          </div>
        </div>
      ) : null}

      {audit.status === "failed" && (
        <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center backdrop-blur-md">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30">
              <AlertCircle className="size-6 text-rose-300" />
            </div>
            <h2 className="text-lg font-semibold">{t("failedTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {tu("failedHint")}
            </p>
            <Link
              href={`/clients/${audit.clientId}`}
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-rose-200 hover:underline"
            >
              {t("backToClient")}
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
