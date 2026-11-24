import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, LayoutGrid, List, Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { loadPortfolio, type PortfolioProject } from "@/lib/portfolio-data";
import {
  averageScore,
  dueIn,
  scoreBand,
  scoreBands,
  scoreTrend,
  todayPicks,
  weeklyCounts,
} from "@/lib/portfolio";

/**
 * The dashboard for an agency with projects: how each project is doing,
 * what to do today, and two charts. Replaces the old hero (latest audit of
 * whichever project ran last) and the four counters that summed nothing
 * useful.
 */
export async function PortfolioOverview({
  view,
  only,
}: {
  view: "list" | "cards";
  /**
   * "projects" renders only the projects table (or cards), as one section
   * of the dashboard; the dashboard already carries the counters, the
   * priority tasks and the score trend above it.
   */
  only?: "projects";
}) {
  const t = await getTranslations("portfolio");
  const tc = await getTranslations("clients");
  const tm = await getTranslations("clientPage.missions");
  const td = await getTranslations("dashboard");
  const locale = await getLocale();
  const now = new Date();
  const data = await loadPortfolio(now);
  const { projects } = data;

  const latest = projects.map((p) => p.scores.at(-1) ?? null);
  const avg = averageScore(latest);
  const urgent = projects.reduce((n, p) => n + p.urgentTasks, 0);
  const picks = todayPicks(data.openTasks, now);
  const bands = scoreBands(latest);
  const weeks = weeklyCounts(data.doneDates, now);
  const maxWeek = Math.max(1, ...weeks.map((w) => w.count));
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);

  const stageTag = (p: PortfolioProject) =>
    p.stage === "audited" ? "gsk-tag gsk-tag--success" : p.stage === "auditing" ? "gsk-tag gsk-tag--warning" : "gsk-tag gsk-tag--default";
  const missionText = (p: PortfolioProject) =>
    p.missions.length > 0 ? p.missions.map((k) => tm(`kind_${k}`)).join(", ") : tc("noMission");

  const projectsSection = (
        <section id="projets" className={`min-w-0 scroll-mt-4 rounded-lg border border-border bg-card ${only ? "" : "lg:col-span-2"}`}>
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t("projectsTitle")}</h2>
              {only && <p className="mt-0.5 text-xs text-muted-foreground">{td("projectsHint")}</p>}
            </div>
            <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={t("viewLabel")}>
              <Link
                href="/?vue=liste#projets"
                aria-current={view === "list" ? "true" : undefined}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${view === "list" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="size-3.5" />
                {t("viewList")}
              </Link>
              <Link
                href="/?vue=cartes#projets"
                aria-current={view === "cards" ? "true" : undefined}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${view === "cards" ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="size-3.5" />
                {t("viewCards")}
              </Link>
            </div>
          </header>

          {/* On a phone the table would scroll sideways, so the list view
              shows the cards there and the table from the sm breakpoint. */}
          {view === "list" && (
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-5 py-2 font-medium">{t("colProject")}</th>
                    <th className="px-3 py-2 font-medium">{t("colStage")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("colScore")}</th>
                    <th className="px-3 py-2 text-right font-medium">{t("colTasks")}</th>
                    <th className="px-5 py-2 text-right font-medium">{t("colLastAudit")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-accent">
                      <td className="min-w-[14rem] px-5 py-2.5">
                        <Link href={`/clients/${p.id}`} className="block truncate font-medium hover:underline">
                          {p.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{missionText(p)}</p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={stageTag(p)}>{tc(`stage_${p.stage}`)}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ScoreCell scores={p.scores} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {p.openTasks}
                        {p.urgentTasks > 0 && (
                          <span className="ml-1 text-xs text-muted-foreground">({t("urgent", { count: p.urgentTasks })})</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-right text-xs text-muted-foreground">
                        {p.lastAuditAt ? dateFmt.format(p.lastAuditAt) : t("never")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            <ul className={`grid gap-3 p-4 sm:grid-cols-2 ${view === "list" ? "sm:hidden" : ""}`}>
              {projects.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/clients/${p.id}`}
                    className="block h-full rounded-md border border-border p-4 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{p.url.replace(/^https?:\/\//, "")}</p>
                      </div>
                      <span className={stageTag(p)}>{tc(`stage_${p.stage}`)}</span>
                    </div>
                    <div className="mt-3">
                      <ScoreCell scores={p.scores} large />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {missionText(p)} · {t("tasksShort", { count: p.openTasks })}
                      {p.urgentTasks > 0 ? ` · ${t("urgent", { count: p.urgentTasks })}` : ""} ·{" "}
                      {p.lastAuditAt ? t("auditedOn", { date: dateFmt.format(p.lastAuditAt) }) : t("never")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
        </section>
  );

  if (only === "projects") {
    return projects.length > 0 ? projectsSection : null;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">{today}</p>
        </div>
        <Link href="/clients/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="size-4" />
          {t("addClient")}
        </Link>
      </header>

      {/* Four numbers about the portfolio, not about the last audit. */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("kpiProjects")} value={projects.length} hint={t("kpiProjectsHint", { count: projects.filter((p) => p.missions.length > 0).length })} />
        <Kpi label={t("kpiAverage")} value={avg ?? "—"} suffix={avg !== null ? "/100" : undefined} hint={t("kpiAverageHint")} />
        <Kpi
          label={t("kpiTasks")}
          value={data.openTasks.length}
          hint={t("kpiTasksHint", { count: urgent })}
          href="/tasks"
        />
        <Kpi label={t("kpiAudits")} value={data.auditsThisMonth} hint={t("kpiAuditsHint")} href="/audits" />
      </section>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {projectsSection}

        {/* Today */}
        <section className="min-w-0 rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">{t("todayTitle")}</h2>
            <Link href="/tasks" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {t("allTasks")}
              <ArrowRight className="size-3" />
            </Link>
          </header>
          {picks.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">{t("todayEmpty")}</p>
          ) : (
            <ol className="divide-y divide-border">
              {picks.map((task) => {
                const due = dueIn(task.dueDate, now);
                return (
                  <li key={task.id} className="px-5 py-3">
                    <Link href={`/tasks?client=${task.clientId}`} className="text-sm font-medium leading-snug hover:underline">
                      {task.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>{task.clientName}</span>
                      {task.priority === "high" && <span className="gsk-tag gsk-tag--danger">{t("priorityHigh")}</span>}
                      <span className={due.kind === "late" ? "text-destructive" : undefined}>
                        {due.kind === "none"
                          ? t("noDue")
                          : due.kind === "days"
                            ? t("dueInDays", { count: due.days })
                            : t(due.kind === "late" ? "dueLate" : "dueToday")}
                      </span>
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>

      {/* Two charts: where the scores are, and how much gets done. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">{t("bandsTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("bandsHint")}</p>
          {bands.weak + bands.fair + bands.good === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t("bandsEmpty")}</p>
          ) : (
            <>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted">
                {(["weak", "fair", "good"] as const).map((b) =>
                  bands[b] > 0 ? (
                    <div
                      key={b}
                      className={b === "weak" ? "bg-red-500" : b === "fair" ? "bg-amber-500" : "bg-emerald-500"}
                      style={{ width: `${(bands[b] / (bands.weak + bands.fair + bands.good)) * 100}%` }}
                    />
                  ) : null,
                )}
              </div>
              <ul className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {(["weak", "fair", "good"] as const).map((b) => (
                  <li key={b} className="flex items-center gap-1.5">
                    <span
                      className={`size-2 rounded-full ${b === "weak" ? "bg-red-500" : b === "fair" ? "bg-amber-500" : "bg-emerald-500"}`}
                    />
                    <span className="text-muted-foreground">{t(`band_${b}`)}</span>
                    <span className="ml-auto font-medium tabular-nums">{bands[b]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">{t("weeksTitle")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("weeksHint")}</p>
          <div className="mt-4 flex h-28 items-end gap-2" role="img" aria-label={t("weeksTitle")}>
            {weeks.map((w) => (
              <div key={w.week.getTime()} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-muted-foreground">{w.count || ""}</span>
                <div
                  className="w-full rounded-sm bg-primary/80"
                  style={{ height: `${Math.max(2, (w.count / maxWeek) * 80)}px`, opacity: w.count ? 1 : 0.25 }}
                />
                <span className="text-[10px] text-muted-foreground">{dateFmt.format(w.week)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  suffix,
  hint,
  href,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  hint: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {value}
        {suffix && <span className="text-sm font-normal text-muted-foreground">{suffix}</span>}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent">
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border border-border bg-card p-4">{body}</div>
  );
}

/** Latest score in the report's colours, a small line of the last audits, the trend. */
function ScoreCell({ scores, large = false }: { scores: number[]; large?: boolean }) {
  const last = scores.at(-1);
  if (last === undefined) return <span className="block text-right text-muted-foreground">—</span>;
  const band = scoreBand(last);
  const trend = scoreTrend(scores);
  const color = band === "weak" ? "text-red-600 dark:text-red-400" : band === "fair" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";
  return (
    <span className={`flex items-center gap-2 ${large ? "" : "justify-end"}`}>
      {scores.length > 1 && <Sparkline values={scores} />}
      <span className={`font-semibold tabular-nums ${large ? "text-2xl" : ""} ${color}`}>{last}</span>
      {trend === "up" && <ArrowUpRight className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
      {trend === "down" && <ArrowDownRight className="size-3.5 text-red-600 dark:text-red-400" />}
    </span>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const w = 56;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-primary" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
