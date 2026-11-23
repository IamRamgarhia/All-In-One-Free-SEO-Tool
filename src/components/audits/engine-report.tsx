import {
  BadgeCheck,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Eye,
  FileCode2,
  FileText,
  Gauge,
  Heading,
  Image as ImageIcon,
  Languages,
  LayoutGrid,
  Lightbulb,
  Link,
  Link2,
  ListChecks,
  Minus,
  ScanSearch,
  Scale,
  Share2,
  Shield,
  Smartphone,
  Undo2,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { RuleStatus } from "@/audit/types";
import type { CategoryRow, EngineReport, RuleRow } from "@/lib/engine-report";
import { verdictForScore } from "@/lib/seomator-meta";
import { ScoreGauge } from "@/components/ui/score-gauge";
import { setStatusForType } from "@/app/audits/issue-actions";
import { ReportLayout, type ReportNavGroup } from "./report-layout";
import { SiteLogo } from "./site-logo";

/**
 * The engine's results, drawn the way SEOmator's report is: a hero with the
 * site's own image, its logo, the domain and the score, then key metrics,
 * one ring per category and the findings to fix first. A sidebar (a tab bar
 * on phones) lists every section, and the section picked fills the page.
 */

export type ExtraSection = { id: string; label: string; count?: number; content: React.ReactNode };

export type ReportHeroInfo = {
  /** Breadcrumb links, drawn over the banner */
  breadcrumb: React.ReactNode;
  /** Export and navigation links */
  actions: React.ReactNode;
  /** "Quick audit", "Full audit"… */
  kindLabel: string;
  completedAt: Date | null;
  /** The landing page screenshot, when the audit took one */
  screenshotSrc: string | null;
  geoScore: number | null;
};

const PASS_THRESHOLD = 70;

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  core: Lightbulb,
  technical: Wrench,
  perf: Gauge,
  links: Link2,
  images: ImageIcon,
  security: Shield,
  crawl: ScanSearch,
  schema: Braces,
  a11y: Eye,
  content: FileText,
  social: Share2,
  eeat: BadgeCheck,
  url: Link,
  mobile: Smartphone,
  i18n: Languages,
  legal: Scale,
  js: FileCode2,
  redirect: Undo2,
  htmlval: Code2,
  geo: Bot,
};

const STATUS_STYLE: Record<RuleStatus, { icon: typeof X; dot: string; card: string }> = {
  fail: { icon: X, dot: "bg-rose-500 text-white", card: "border-rose-500/25 bg-rose-500/[0.06]" },
  warn: { icon: Lightbulb, dot: "bg-amber-500 text-black", card: "border-amber-500/25 bg-amber-500/[0.06]" },
  pass: { icon: Check, dot: "bg-emerald-500 text-black", card: "border-white/5 bg-white/[0.02]" },
  "not-measured": { icon: Minus, dot: "bg-white/15 text-muted-foreground", card: "border-white/5 bg-white/[0.02]" },
};

function scoreTone(score: number) {
  if (score >= 80) return { stroke: "#34d399", text: "text-emerald-300", bar: "bg-emerald-400" };
  if (score >= 60) return { stroke: "#fbbf24", text: "text-amber-300", bar: "bg-amber-400" };
  return { stroke: "#fb7185", text: "text-rose-300", bar: "bg-rose-400" };
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Resolves a page-relative URL (og:image, icon) against the audited page; http(s) only. */
function absoluteUrl(src: string, base: string) {
  try {
    const u = new URL(src, base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

function StatusDot({ status }: { status: RuleStatus }) {
  const s = STATUS_STYLE[status];
  const Icon = status === "warn" ? null : s.icon;
  return (
    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full ${s.dot}`}>
      {Icon ? <Icon className="size-3" strokeWidth={3} /> : <span className="text-[11px] font-bold">!</span>}
    </span>
  );
}

/** A score in a ring, as SEOmator draws each category. */
function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const stroke = 4;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(score);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (score / 100) * c}
        />
      </svg>
      <span className={`absolute font-semibold tabular-nums ${tone.text}`} style={{ fontSize: size * 0.3 }}>
        {score}
      </span>
    </span>
  );
}

function Card({
  icon: Icon,
  title,
  hint,
  children,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md sm:p-6 ${className}`}>
      <header className="mb-5 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{hint}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}

export async function EngineReportView({
  report,
  auditId,
  activeTypes,
  pagesCrawled,
  issuesCount,
  badge,
  hero,
  afterSnapshot,
  extra = [],
}: {
  report: EngineReport;
  auditId: number;
  /** Issue types still open on this audit, for the per-rule actions */
  activeTypes: Set<string>;
  pagesCrawled: number | null;
  issuesCount: number;
  badge: React.ReactNode;
  hero: ReportHeroInfo;
  /** Rendered under the page snapshot (CWV, caps) */
  afterSnapshot?: React.ReactNode;
  /** SEO Tool's own sections (GEO, its checks), listed after the categories */
  extra?: ExtraSection[];
}) {
  const t = await getTranslations("audits.report");
  const locale = await getLocale();
  const multiPage = report.pages.length > 1;
  const issueTotal = report.totals.fail + report.totals.warn;
  const catLabel = (c: CategoryRow) => (t.has(`cat.${c.id}`) ? t(`cat.${c.id}`) : c.name);
  const verdictOf = (score: number) => {
    const g = verdictForScore(score).grade;
    return t.has(`verdict.${g}`) ? t(`verdict.${g}`) : verdictForScore(score).label;
  };

  const overview = (
    <>
      <KeyMetrics report={report} pages={pagesCrawled ?? report.pages.length} geoScore={hero.geoScore} t={t} />
      <CategoryGrid report={report} label={catLabel} verdictOf={verdictOf} t={t} />
      <FixFirst report={report} multiPage={multiPage} issueTotal={issueTotal} label={catLabel} t={t} />
      <div className="flex flex-wrap items-center gap-3 px-1 text-xs text-muted-foreground">
        <span>{t("issuesSummary", { issues: issuesCount, pages: pagesCrawled ?? report.pages.length })}</span>
        {badge}
      </div>
    </>
  );

  const groups: ReportNavGroup[] = [
    {
      label: t("navOverview"),
      items: [
        { id: "overview", label: t("navSummary"), fail: report.totals.fail, warn: report.totals.warn },
        { id: "page", label: multiPage ? t("navStartPage") : t("navPage") },
      ],
    },
    {
      label: t("navCategories", { count: report.categories.length }),
      items: report.categories.map((c) => ({
        id: `cat-${c.id}`,
        label: catLabel(c),
        score: c.score,
        fail: c.counts.fail,
        warn: c.counts.warn,
      })),
    },
  ];
  if (extra.length) {
    groups.push({ label: t("navSeoTool"), items: extra.map((e) => ({ id: e.id, label: e.label, warn: e.count })) });
  }

  return (
    <>
      <ReportHero report={report} hero={hero} locale={locale} pages={pagesCrawled ?? report.pages.length} verdictOf={verdictOf} t={t} />
      <ReportLayout
        navLabel={t("navAria")}
        groups={groups}
        panels={[
          { id: "overview", content: overview },
          {
            id: "page",
            content: (
              <>
                <Snapshot report={report} multiPage={multiPage} t={t} />
                {afterSnapshot}
              </>
            ),
          },
          ...report.categories.map((c) => ({
            id: `cat-${c.id}`,
            content: (
              <CategoryCard
                category={c}
                name={catLabel(c)}
                verdict={verdictOf(c.score)}
                auditId={auditId}
                activeTypes={activeTypes}
                multiPage={multiPage}
                t={t}
              />
            ),
          })),
          ...extra.map((e) => ({ id: e.id, content: e.content })),
        ]}
      />
    </>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"audits.report">>>;

function ReportHero({
  report,
  hero,
  locale,
  pages,
  verdictOf,
  t,
}: {
  report: EngineReport;
  hero: ReportHeroInfo;
  locale: string;
  pages: number;
  verdictOf: (score: number) => string;
  t: T;
}) {
  const base = report.pages[0] ?? report.url;
  const host = hostOf(report.url);
  // SEOmator's banner is the page's own share image; the screenshot stands
  // in when the page declares none.
  const banner =
    (report.page?.og.image ? absoluteUrl(report.page.og.image, base) : null) ?? hero.screenshotSrc;
  const logo = report.page?.logo ? absoluteUrl(report.page.logo, base) : absoluteUrl("/favicon.ico", base);
  const grade = verdictForScore(report.score).grade;
  const passed = report.score >= PASS_THRESHOLD;
  const chip = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset";

  return (
    // The site's own image fills the whole hero, as on SEOmator; the text
    // and the score sit on top of it, over a dark veil that keeps them
    // readable whatever the photo.
    <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl shadow-black/40">
      {banner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" referrerPolicy="no-referrer" className="absolute inset-0 -z-10 size-full object-cover object-center" />
      ) : (
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-br from-cyan-600/50 via-violet-700/40 to-fuchsia-700/40"
          style={report.page?.themeColor ? { backgroundColor: report.page.themeColor } : undefined}
        />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/55 to-black/25" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />

      <nav className="relative flex w-fit max-w-[calc(100%-2rem)] items-center gap-1 overflow-hidden rounded-full bg-black/40 px-3 py-1.5 text-xs text-white/80 ring-1 ring-white/10 backdrop-blur-md ml-4 mt-4 sm:ml-6 sm:mt-5">
        {hero.breadcrumb}
      </nav>

      <div className="relative grid gap-6 px-5 pb-6 pt-24 sm:px-8 sm:pb-8 sm:pt-36 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pt-44">
        <div className="min-w-0 space-y-4">
          <div className="flex items-end gap-4">
            <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-2xl font-bold uppercase text-slate-800 shadow-xl ring-2 ring-white/30 sm:size-20">
              {host.charAt(0)}
              {logo ? <SiteLogo src={logo} /> : null}
            </span>
            <div className="min-w-0 pb-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">
                {t("heroEyebrow")}
              </div>
              <h1 className="truncate text-3xl font-bold tracking-tight drop-shadow-lg sm:text-5xl">{host}</h1>
            </div>
          </div>

          {report.page?.title ? <p className="line-clamp-2 max-w-2xl text-sm text-white/80 sm:text-base">{report.page.title}</p> : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75">
            <span>{t("heroMeta", { rules: report.totals.total, categories: report.categories.length })}</span>
            <span className="text-white/40">•</span>
            <span>{t("pagesAnalyzed", { count: pages })}</span>
            {hero.completedAt ? (
              <>
                <span className="text-white/40">•</span>
                <span>{hero.completedAt.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">{hero.actions}</div>

          <div className="flex flex-wrap gap-2">
            <span className={`${chip} bg-emerald-500/20 text-emerald-200 ring-emerald-400/40 backdrop-blur-md`}>
              <CheckCircle2 className="size-3" />
              {t("passedChecks", { count: report.totals.pass })}
            </span>
            <span className={`${chip} bg-sky-500/20 text-sky-200 ring-sky-400/40 backdrop-blur-md`}>
              <LayoutGrid className="size-3" />
              {t("categoriesCount", { count: report.categories.length })}
            </span>
            <span className={`${chip} bg-violet-500/20 text-violet-200 ring-violet-400/40 backdrop-blur-md`}>{hero.kindLabel}</span>
            <span
              className={`${chip} ${
                passed ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/40 backdrop-blur-md" : "bg-rose-500/20 text-rose-200 ring-rose-400/40 backdrop-blur-md"
              }`}
            >
              {passed ? <Check className="size-3" /> : <X className="size-3" />}
              {passed ? t("verdictPassed", { threshold: PASS_THRESHOLD }) : t("verdictFailed", { threshold: PASS_THRESHOLD })}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-5 rounded-2xl border border-white/15 bg-black/45 p-4 backdrop-blur-xl lg:w-[320px] lg:flex-col lg:gap-2 lg:p-6 lg:text-center">
          <ScoreGauge score={report.score} size={150} label={verdictOf(report.score)} />
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-semibold">{t("seoScore")}</div>
            <p className="text-xs leading-relaxed text-white/75 sm:text-sm">{t(`verdictText.${grade}` as "verdictText.A")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function KeyMetrics({ report, pages, geoScore, t }: { report: EngineReport; pages: number; geoScore: number | null; t: T }) {
  const m = report.page?.metrics;
  const tiles: { label: string; value: string | number; tone?: "good" | "warn" | "bad" }[] = [
    { label: t("checks"), value: report.totals.total },
    { label: t("passed"), value: report.totals.pass, tone: "good" },
    { label: t("warnings"), value: report.totals.warn, tone: report.totals.warn ? "warn" : "good" },
    { label: t("failures"), value: report.totals.fail, tone: report.totals.fail ? "bad" : "good" },
    { label: t("notMeasured"), value: report.totals["not-measured"] },
    ...(m
      ? [
          { label: t("words"), value: m.wordCount.toLocaleString() },
          { label: t("internalLinks"), value: m.internalLinks },
          { label: t("externalLinks"), value: m.externalLinks },
          { label: t("images"), value: m.images },
          { label: t("textRatio"), value: `${m.textRatio}%`, tone: m.textRatio < 10 ? ("bad" as const) : undefined },
        ]
      : []),
    ...(geoScore != null
      ? [{ label: t("geoScore"), value: geoScore, tone: geoScore >= 80 ? ("good" as const) : geoScore >= 60 ? ("warn" as const) : ("bad" as const) }]
      : []),
  ];
  const toneClass = {
    good: "border-l-emerald-400 bg-emerald-500/[0.04] [&_.v]:text-emerald-300",
    warn: "border-l-amber-400 bg-amber-500/[0.05] [&_.v]:text-amber-300",
    bad: "border-l-rose-400 bg-rose-500/[0.05] [&_.v]:text-rose-300",
  };
  return (
    <Card icon={LayoutGrid} title={t("keyMetricsTitle")} hint={`${t("keyMetricsHint")} · ${t("pagesAnalyzed", { count: pages })}`}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`rounded-xl border border-white/5 border-l-2 px-4 py-3 ${tile.tone ? toneClass[tile.tone] : "border-l-white/10 bg-white/[0.02]"}`}
          >
            <div className="truncate text-xs text-muted-foreground">{tile.label}</div>
            <div className="v mt-1 text-2xl font-semibold tabular-nums">{tile.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CategoryGrid({
  report,
  label,
  verdictOf,
  t,
}: {
  report: EngineReport;
  label: (c: CategoryRow) => string;
  verdictOf: (score: number) => string;
  t: T;
}) {
  const totalWeight = report.categories.reduce((sum, c) => sum + c.weight, 0) || 1;
  return (
    <Card icon={ListChecks} title={t("categoriesTitle")} hint={t("categoriesHint", { count: report.categories.length })}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {report.categories.map((c) => {
          const Icon = CATEGORY_ICONS[c.id] ?? ListChecks;
          const checks = c.counts.pass + c.counts.warn + c.counts.fail;
          return (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className="group flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-4 text-center transition-colors hover:border-white/15 hover:bg-white/[0.05]"
            >
              <ScoreRing score={c.score} size={60} />
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="line-clamp-2 leading-tight">{label(c)}</span>
              </span>
              <span className="text-[11px]">
                {c.counts.fail ? <span className="text-rose-300">{t("failedCount", { count: c.counts.fail })} · </span> : null}
                {c.counts.warn ? <span className="text-amber-300">{t("warningsCount", { count: c.counts.warn })} · </span> : null}
                <span className="text-emerald-300">
                  {c.counts.pass}/{checks}
                </span>
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                {verdictOf(c.score)} · {t("weight", { weight: Math.round((c.weight / totalWeight) * 100) })}
              </span>
            </a>
          );
        })}
      </div>
    </Card>
  );
}

function FixFirst({
  report,
  multiPage,
  issueTotal,
  label,
  t,
}: {
  report: EngineReport;
  multiPage: boolean;
  issueTotal: number;
  label: (c: CategoryRow) => string;
  t: T;
}) {
  if (report.top.length === 0) return null;
  const names = new Map(report.categories.map((c) => [c.id, label(c)]));
  const groups = [
    { status: "fail" as const, title: t("critical"), dot: "bg-rose-400", rows: report.top.filter((r) => r.status === "fail") },
    { status: "warn" as const, title: t("warning"), dot: "bg-amber-400", rows: report.top.filter((r) => r.status === "warn") },
  ].filter((g) => g.rows.length);
  return (
    <Card icon={Lightbulb} title={t("priorityTitle")} hint={t("priorityHint", { count: report.top.length, total: issueTotal })}>
      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.status} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className={`size-2 rounded-full ${g.dot}`} />
              {g.title}
              <span className="text-xs font-normal text-muted-foreground">{g.rows.length}</span>
            </div>
            {g.rows.map((r) => {
              const pages = new Set(r.findings.flatMap((f) => f.pages));
              return (
                <a
                  key={r.ruleId}
                  href={`#rule-${r.ruleId}`}
                  className={`flex items-center gap-3 rounded-xl border border-l-4 px-4 py-3 transition-colors hover:bg-white/[0.04] ${
                    g.status === "fail" ? "border-white/5 border-l-rose-400" : "border-white/5 border-l-amber-400"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{r.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.findings[0]?.message ?? names.get(r.categoryId) ?? r.categoryName}
                    </span>
                  </span>
                  <span className="hidden shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
                    {names.get(r.categoryId) ?? r.categoryName}
                  </span>
                  {multiPage && pages.size > 1 ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">{t("pagesCount", { count: pages.size })}</span>
                  ) : null}
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function Snapshot({ report, multiPage, t }: { report: EngineReport; multiPage: boolean; t: T }) {
  const page = report.page;
  if (!page) return null;
  const base = report.pages[0] ?? report.url;
  const ogImage = page.og.image ? absoluteUrl(page.og.image, base) : null;
  const metaRows: [string, string | undefined][] = [
    ["title", page.title],
    ["description", page.description],
    ["canonical", page.canonical],
    ["og:title", page.og.title],
    ["og:description", page.og.description],
    ["og:image", page.og.image],
    ["og:type", page.og.type],
    ["og:site_name", page.og.siteName],
    ["twitter:card", page.twitterCard],
  ];
  const levels = [1, 2, 3, 4, 5, 6]
    .map((level) => ({ level, items: page.headings.filter((h) => h.level === level) }))
    .filter((l) => l.items.length);

  return (
    <>
      <Card
        icon={Share2}
        title={multiPage ? `${t("snapshotTitle")} · ${t("startPage")}` : t("snapshotTitle")}
        hint={t("snapshotHint")}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-muted-foreground">
              {t("metaTags")}
            </div>
            <table className="w-full table-fixed text-xs">
              <tbody className="divide-y divide-white/5">
                {metaRows.map(([k, v]) => (
                  <tr key={k}>
                    <td className="w-32 px-3 py-2 align-top font-mono text-muted-foreground">{k}</td>
                    <td className="truncate px-3 py-2">{v ?? <span className="italic text-rose-300/80">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
              {ogImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ogImage} alt="" referrerPolicy="no-referrer" loading="lazy" className="aspect-[1.91/1] w-full bg-black/30 object-cover" />
              ) : null}
              <div className="space-y-0.5 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">{page.og.siteName ?? hostOf(base)}</div>
                <div className="line-clamp-1 text-sm font-semibold">
                  {page.og.title ?? page.title ?? <span className="italic text-muted-foreground">{t("missingTitle")}</span>}
                </div>
                <div className="line-clamp-2 text-xs text-muted-foreground">
                  {page.og.description ?? page.description ?? <span className="italic">{t("missingDescription")}</span>}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">{t("googleResult")}</div>
              <div className="space-y-0.5 rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="truncate text-xs text-emerald-300/80">{page.canonical ?? base}</div>
                <div className="text-base text-sky-300">
                  {page.title ?? <span className="italic text-muted-foreground">{t("missingTitle")}</span>}
                </div>
                <div className="line-clamp-2 text-sm text-muted-foreground">
                  {page.description ?? <span className="italic">{t("missingDescription")}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card icon={Heading} title={t("outlineTitle")} hint={t("outlineHint")}>
        {levels.length ? (
          <div className="space-y-3">
            {levels.map((l) => (
              <details key={l.level} open={l.level <= 2} className="group rounded-xl border border-white/5 bg-white/[0.02]">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none">
                  <span className="flex size-7 items-center justify-center rounded-md bg-sky-500/80 font-mono text-[11px] font-bold text-white">
                    H{l.level}
                  </span>
                  <span className="text-sm">{t("tagsFound", { count: l.items.length })}</span>
                  <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <ol className="ml-7 space-y-1 border-l border-white/10 px-4 pb-3 text-sm">
                  {l.items.map((h, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-5 shrink-0 text-right font-mono text-[11px] text-muted-foreground">{i + 1}.</span>
                      <span className="min-w-0 truncate">{h.text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        ) : (
          <p className="text-sm italic text-muted-foreground">{t("noHeadings")}</p>
        )}
      </Card>
    </>
  );
}

function CategoryCard({
  category: c,
  name,
  verdict,
  auditId,
  activeTypes,
  multiPage,
  t,
}: {
  category: CategoryRow;
  name: string;
  verdict: string;
  auditId: number;
  activeTypes: Set<string>;
  multiPage: boolean;
  t: T;
}) {
  const Icon = CATEGORY_ICONS[c.id] ?? ListChecks;
  const checks = c.counts.pass + c.counts.warn + c.counts.fail + c.counts["not-measured"];
  const passed = c.quiet.filter((r) => r.status === "pass");
  const unmeasured = c.quiet.filter((r) => r.status === "not-measured");
  const pill = "rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset";
  return (
    <section className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md sm:p-6">
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <ScoreRing score={c.score} size={60} />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Icon className="size-4 text-sky-300" />
            {name}
          </h2>
          <p className="text-sm text-muted-foreground">{t("categoryMeta", { count: checks, verdict })}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {c.counts.fail ? <span className={`${pill} bg-rose-500/10 text-rose-300 ring-rose-500/25`}>{t("failedCount", { count: c.counts.fail })}</span> : null}
          {c.counts.warn ? <span className={`${pill} bg-amber-500/10 text-amber-300 ring-amber-500/25`}>{t("warningsCount", { count: c.counts.warn })}</span> : null}
          <span className={`${pill} bg-emerald-500/10 text-emerald-300 ring-emerald-500/25`}>{t("passedCount", { count: c.counts.pass })}</span>
          {c.counts["not-measured"] ? (
            <span className={`${pill} bg-white/5 text-muted-foreground ring-white/10`}>{t("notMeasuredCount", { count: c.counts["not-measured"] })}</span>
          ) : null}
        </div>
      </header>

      <ul className="space-y-2.5">
        {c.issues.map((r) => (
          <RuleItem key={r.ruleId} rule={r} auditId={auditId} open={activeTypes.has(`seomator:${r.ruleId}`)} multiPage={multiPage} t={t} />
        ))}
      </ul>

      {passed.length > 0 ? (
        <QuietList rows={passed} title={t("passedChecks", { count: passed.length })} tone="pass" open={c.issues.length === 0} />
      ) : null}
      {unmeasured.length > 0 ? (
        <QuietList rows={unmeasured} title={t("notMeasuredChecks", { count: unmeasured.length })} tone="not-measured" open={false} />
      ) : null}
    </section>
  );
}

function QuietList({ rows, title, tone, open }: { rows: RuleRow[]; title: string; tone: "pass" | "not-measured"; open: boolean }) {
  return (
    <details open={open} className="group mt-2.5">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium marker:content-none ${
          tone === "pass" ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300" : "border-white/5 bg-white/[0.02] text-muted-foreground"
        }`}
      >
        <StatusDot status={tone} />
        {title}
        <ChevronDown className="ml-auto size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-2 space-y-2">
        {rows.map((r) => (
          <li key={r.ruleId} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5">
            <StatusDot status={r.status} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{r.name}</span>
              <span className="block font-mono text-[11px] text-muted-foreground">{r.ruleId}</span>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RuleItem({
  rule: r,
  auditId,
  open,
  multiPage,
  t,
}: {
  rule: RuleRow;
  auditId: number;
  /** An open issue exists for this rule, so it can be closed from here */
  open: boolean;
  multiPage: boolean;
  t: T;
}) {
  const type = `seomator:${r.ruleId}`;
  return (
    <li id={`rule-${r.ruleId}`} className={`scroll-mt-24 rounded-xl border px-4 py-3.5 ${STATUS_STYLE[r.status].card}`}>
      <div className="flex gap-3">
        <StatusDot status={r.status} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-semibold">{r.name}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{r.ruleId}</span>
            {r.advisory ? (
              <span
                title={t("advisoryHint")}
                className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {t("advisoryBadge")}
              </span>
            ) : null}
          </div>
          {r.findings.map((f, i) => (
            <div key={i} className="text-sm text-foreground/80">
              {f.message}
              {multiPage && f.pages.length > 0 ? (
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">{t("onPages", { count: f.pages.length })}</summary>
                  <ul className="mt-1 space-y-0.5 border-l border-white/10 pl-3">
                    {f.pages.slice(0, 25).map((p) => (
                      <li key={p} className="truncate">
                        {shortUrl(p)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
          <details className="text-xs">
            <summary className="inline-flex cursor-pointer items-center gap-1.5 font-semibold uppercase tracking-wider text-sky-300 hover:text-sky-200">
              <Lightbulb className="size-3.5" />
              {t("howToFix")}
            </summary>
            <p className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 leading-relaxed text-sky-100/90">{r.fix}</p>
          </details>
          {open ? (
            <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
              <form action={setStatusForType.bind(null, auditId, type, "resolved")}>
                <button type="submit" className="rounded-md bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/20">
                  {t("markResolved")}
                </button>
              </form>
              <form action={setStatusForType.bind(null, auditId, type, "ignored")}>
                <button type="submit" className="rounded-md bg-white/5 px-2 py-1 font-medium text-muted-foreground ring-1 ring-inset ring-white/10 hover:bg-white/10">
                  {t("ignore")}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
