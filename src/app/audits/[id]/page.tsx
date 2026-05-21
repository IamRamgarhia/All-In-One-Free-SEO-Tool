import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, asc } from "drizzle-orm";

export const dynamic = "force-dynamic";

import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Info,
} from "lucide-react";
import { db } from "@/db/client";
import { audits, auditIssues, clients } from "@/db/schema";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { Term } from "@/components/ui/term";
import { ConfidenceBadge } from "@/components/ui/confidence-badge";
import { FixWizard } from "@/components/fix-wizard";
import { IssueExplainer } from "@/components/issue-explainer";
import { isFixable } from "@/lib/fix-suggestions";
import { confidenceReason } from "@/lib/audit-confidence";
import { setStatusForType } from "../issue-actions";

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
    label: string;
    iconBg: string;
    iconText: string;
    icon: typeof AlertCircle;
    pill: string;
    accent: string;
  }
> = {
  critical: {
    label: "Critical",
    iconBg: "bg-rose-500/15 ring-rose-400/30",
    iconText: "text-rose-300",
    icon: AlertCircle,
    pill: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
    accent: "from-rose-500/25",
  },
  high: {
    label: "High",
    iconBg: "bg-rose-500/10 ring-rose-400/20",
    iconText: "text-rose-300",
    icon: AlertTriangle,
    pill: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    accent: "from-rose-500/15",
  },
  medium: {
    label: "Medium",
    iconBg: "bg-amber-500/15 ring-amber-400/30",
    iconText: "text-amber-300",
    icon: AlertTriangle,
    pill: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    accent: "from-amber-500/15",
  },
  low: {
    label: "Low",
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

  const [audit] = await db
    .select()
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

  const allIssues = await db
    .select()
    .from(auditIssues)
    .where(eq(auditIssues.auditId, auditId))
    .orderBy(asc(auditIssues.severity));

  // Only show non-active issues if user explicitly toggles a filter; for now
  // the main view shows everything except resolved/ignored/false-positive.
  const issues = allIssues.filter((i) => i.status === "new");
  const closedCount = allIssues.length - issues.length;

  const sorted = [...issues].sort(
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
      } else {
        map.set(key, {
          severity: i.severity as Group["severity"],
          type: i.type,
          sample: i.message,
          affectedUrls: [i.url],
          issueIds: [i.id],
          confidence: iConf,
          aiGenerated: iAi,
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

  // Approximate pages crawled by counting distinct URLs across findings.
  const distinctUrls = new Set(issues.map((i) => i.url));
  const pagesCrawled = distinctUrls.size;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 px-6 py-7 backdrop-blur-md">
        <div className="pointer-events-none absolute -left-20 -top-20 size-72 rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/15 blur-[100px]" />
        <div className="pointer-events-none absolute -right-16 -bottom-16 size-56 rounded-full bg-fuchsia-500/15 blur-[80px]" />

        <nav className="relative flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            href="/clients"
            className="rounded px-1 py-0.5 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            Clients
          </Link>
          <span>/</span>
          <Link
            href={`/clients/${client.id}`}
            className="rounded px-1 py-0.5 transition-colors hover:bg-white/5 hover:text-foreground"
          >
            {client.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Audit #{audit.id}</span>
        </nav>

        <div className="relative z-10 mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
                <ClipboardList className="size-5 text-cyan-300" />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">
                  <span className="text-gradient-brand">Audit results</span>
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {audit.completedAt
                    ? `Completed ${audit.completedAt.toLocaleString()}`
                    : `Started ${(audit.startedAt ?? audit.createdAt).toLocaleString()}`}{" "}
                  · {client.name}
                </p>
              </div>
            </div>
            <Link
              href={`/clients/${client.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              View client
            </Link>
          </div>

          <div className="relative flex items-center gap-5 rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur">
            <ScoreGauge score={audit.score ?? null} size={140} />
            <div className="space-y-1.5">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Health score
              </div>
              <div className="text-sm font-medium">
                {audit.issuesCount} issues across {pagesCrawled} page
                {pagesCrawled === 1 ? "" : "s"}
              </div>
              <div className="text-xs text-muted-foreground">
                {audit.status === "completed" ? "Out of 100" : audit.status}
              </div>
            </div>
          </div>
        </div>
      </section>

      {closedCount > 0 && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-200">
          {closedCount} issue{closedCount === 1 ? "" : "s"} marked resolved /
          ignored / false positive — they&apos;re hidden from the active list
          below.
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
                  {cfg.label}
                </div>
              </div>
              <div className="relative mt-3 text-3xl font-semibold tracking-tight">
                {totalOccurrences}
              </div>
              {list.length > 0 && (
                <div className="relative mt-1 text-[10px] text-muted-foreground">
                  {list.length} type{list.length === 1 ? "" : "s"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* TASKS LINK */}
      {issues.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-violet-500/10 via-card/40 to-amber-500/5 px-5 py-4 backdrop-blur-md">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-amber-500/15 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-400" />
              <span>
                Auto-generated{" "}
                <span className="font-semibold">
                  {[...grouped.critical, ...grouped.high, ...grouped.medium]
                    .length}
                </span>{" "}
                task type{[...grouped.critical, ...grouped.high, ...grouped.medium]
                    .length === 1 ? "" : "s"} from non-low-severity issues.
              </span>
            </div>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
            >
              Open tasks
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
                <h2 className="text-base font-semibold">{cfg.label}</h2>
                <p className="text-xs text-muted-foreground">
                  {list.length} issue type{list.length === 1 ? "" : "s"} ·{" "}
                  {totalAffected} occurrence{totalAffected === 1 ? "" : "s"}
                </p>
              </div>
            </header>
            <ul className="relative divide-y divide-white/5">
              {list.map((g) => (
                <li key={g.type} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        {issueTypeToTerm[g.type] ? (
                          <Term term={issueTypeToTerm[g.type]}>
                            <span className="font-medium capitalize">
                              {g.type.replace(/_/g, " ")}
                            </span>
                          </Term>
                        ) : (
                          <span className="font-medium capitalize">
                            {g.type.replace(/_/g, " ")}
                          </span>
                        )}
                        {g.affectedUrls.length > 1 && (
                          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10">
                            {g.affectedUrls.length} pages
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
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                          {g.affectedUrls.length === 1
                            ? "Show URL"
                            : `Show ${g.affectedUrls.length} URLs`}
                        </summary>
                        <ul className="mt-2 space-y-0.5 border-l border-white/10 pl-3 text-xs text-muted-foreground">
                          {g.affectedUrls.slice(0, 25).map((u, i) => (
                            <li key={i} className="truncate">
                              {u}
                            </li>
                          ))}
                          {g.affectedUrls.length > 25 && (
                            <li className="text-[11px] italic">
                              +{g.affectedUrls.length - 25} more
                            </li>
                          )}
                        </ul>
                      </details>

                      <div className="mt-2">
                        <IssueExplainer
                          issueType={g.type}
                          url={g.affectedUrls[0]}
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
                            ✓ Mark resolved
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
                            Ignore
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
                            False positive
                          </button>
                        </form>
                      </div>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.pill}`}
                    >
                      {cfg.label}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {issues.length === 0 && audit.status === "completed" && (
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-12 text-center backdrop-blur-md">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30">
              <CheckCircle2 className="size-6 text-emerald-300" />
            </div>
            <h2 className="text-lg font-semibold">All clear</h2>
            <p className="text-sm text-muted-foreground">
              No issues found. Score: {audit.score}/100.
            </p>
          </div>
        </div>
      )}

      {audit.status === "failed" && (
        <div className="relative overflow-hidden rounded-2xl border border-rose-500/20 bg-rose-500/5 px-6 py-12 text-center backdrop-blur-md">
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/10 blur-3xl" />
          <div className="relative mx-auto flex max-w-md flex-col items-center gap-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-400/30">
              <AlertCircle className="size-6 text-rose-300" />
            </div>
            <h2 className="text-lg font-semibold">Audit failed</h2>
            <p className="text-sm text-muted-foreground">
              The site may have been unreachable. Try running it again from the
              client page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
