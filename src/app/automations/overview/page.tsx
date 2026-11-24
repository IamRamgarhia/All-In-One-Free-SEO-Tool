import type { Tx } from "@/lib/tx";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowLeft, Bot, Calendar, CheckCircle2, Clock, Mail, RefreshCw, ScanLine, ShieldAlert, Target, TrendingDown, Workflow, Globe, HandMetal } from "lucide-react";
import { getSetting } from "@/lib/settings-store";
import { SchedulerStatusPanel } from "./scheduler-status";
import { PageHeader } from "@/components/shell/page-header";

export const dynamic = "force-dynamic";

type Automation = {
  id: string;
  title: string;
  cadence: "every 24h" | "weekly (Monday)" | "on event" | "every check-in";
  icon: typeof Bot;
  accent: string;
  description: string;
  manualEquivalent?: string;
  /** Settings key in the settings table that records the last run timestamp. */
  lastRunKey?: string;
  /** Where in the UI to inspect results. */
  whereToSee?: { label: string; href: string };
};

const AUTOMATIONS = (tx: Tx): Automation[] => ([
  {
    id: "daily-agent",
    title: tx("dailySeoAgent"),
    cadence: "every 24h",
    icon: Bot,
    accent: "violet",
    description:
      tx("walksEveryActiveClientAnd"),
    lastRunKey: "daily_agent_runner.last_run",
    whereToSee: { label: tx("activityLog"), href: "/activity" },
  },
  {
    id: "weekly-rank-sweep",
    title: tx("weeklyRankSweep"),
    cadence: "weekly (Monday)",
    icon: Target,
    accent: "emerald",
    description:
      tx("everyMondayReChecksAll"),
    whereToSee: { label: tx("keywordsDashboard"), href: "/keywords" },
  },
  {
    id: "weekly-ai-audit",
    title: tx("weeklyAiSiteAudit"),
    cadence: "weekly (Monday)",
    icon: ScanLine,
    accent: "violet",
    description:
      tx("rerunsTheAiAudit"),
    whereToSee: { label: tx("audits"), href: "/audits" },
  },
  {
    id: "weekly-serp-features",
    title: tx("weeklySerpFeatureSnapshot"),
    cadence: "weekly (Monday)",
    icon: Calendar,
    accent: "cyan",
    description:
      tx("capturesSerpFeaturePresenceAi"),
    whereToSee: { label: tx("serpFeatures"), href: "/tools/serp-features" },
  },
  {
    id: "page-monitor",
    title: tx("pageChangeMonitor"),
    cadence: "every check-in",
    icon: ShieldAlert,
    accent: "amber",
    description:
      tx("watchesTitleH1MetaStructured"),
    whereToSee: { label: tx("monitor"), href: "/monitor" },
  },
  {
    id: "uptime-check",
    title: tx("uptimeMonitor"),
    cadence: "every check-in",
    icon: CheckCircle2,
    accent: "emerald",
    description:
      tx("httpStatusResponseTimeCheck"),
    whereToSee: { label: tx("uptimeTool"), href: "/tools/uptime" },
  },
  {
    id: "report-mailer",
    title: tx("scheduledReportDelivery"),
    cadence: "on event",
    icon: Mail,
    accent: "violet",
    description:
      tx("whenAScheduledReportTime"),
    whereToSee: { label: tx("reports"), href: "/reports" },
  },
  {
    id: "metric-snapshots",
    title: tx("clientMetricSnapshots"),
    cadence: "every 24h",
    icon: TrendingDown,
    accent: "cyan",
    description:
      tx("dailySnapshotOfEveryClient"),
    whereToSee: { label: tx("snapshots"), href: "/snapshots" },
  },
  {
    id: "morning-briefing",
    title: tx("morningBriefing"),
    cadence: "every 24h",
    icon: RefreshCw,
    accent: "amber",
    description:
      tx("preRendersThePriorityList"),
    whereToSee: { label: tx("dashboard"), href: "/" },
  },
]);

type ManualGuide = {
  title: string;
  whyManual: string;
  where: string;
  steps: string[];
  link?: { label: string; href: string };
};

/** Message key of each cadence chip (the English stays as fallback). */
const CADENCE_KEY: Record<Automation["cadence"], string> = {
  "every 24h": "daily",
  "weekly (Monday)": "weeklyMonday",
  "on event": "onEvent",
  "every check-in": "everyCheckIn",
};

const MANUAL_GUIDES = (tx: Tx): ManualGuide[] => ([
  {
    title: tx("submitToBacklinkDirectories"),
    whyManual:
      tx("mostDirectoriesRequireAHuman"),
    where: tx("yourLibraryOfCuratedProspects"),
    steps: [
      tx("openTheBacklinkProspectsLibrary"),
      tx("filterByYourCountryNiche"),
      tx("forEachProspectClickOpen"),
      tx("goal35SubmissionsWeek"),
    ],
    link: {
      label: tx("openProspectsLibrary"),
      href: "/link-building/library",
    },
  },
  {
    title: tx("claimGoogleBusinessProfile"),
    whyManual:
      tx("googleRequiresPostcardPhoneVideo"),
    where: "google.com/business",
    steps: [
      tx("goToGoogleComBusiness"),
      tx("addYourBusinessWithThe"),
      tx("verifyPostcardTakes514"),
      tx("addCategoriesPhotosServicesHours"),
      tx("postAWeeklyUpdateGoogle"),
    ],
    link: { label: tx("gbpToolkit"), href: "/gbp" },
  },
  {
    title: tx("connectGoogleSearchConsole"),
    whyManual:
      tx("gscNeedsYouToVerify"),
    where: tx("settingsIntegrationsGoogleSearchConsole"),
    steps: [
      tx("openSettingsIntegrations"),
      tx("clickConnectGoogleAccount"),
      tx("approveTheGscGa4Read"),
      tx("pickYourGscPropertyGa4"),
      tx("wait24hForTheFirst"),
    ],
    link: { label: tx("settingsIntegrations"), href: "/settings#integrations" },
  },
  {
    title: tx("applyForHaroConnectivelyResponses"),
    whyManual:
      tx("journalistQueriesAreTimeSensitive"),
    where: "connectively.us or qwoted.com",
    steps: [
      tx("subscribeToConnectivelyForYour"),
      tx("whenAQueryLandsReply"),
      "300 words max with a 1-line credentialed bio.",
      tx("include1SpecificLinkA"),
      tx("trackWinsInBacklinksAs"),
    ],
    link: { label: tx("openBacklinksTracker"), href: "/backlinks" },
  },
  {
    title: tx("applyWordpressFixesViaPlugin"),
    whyManual:
      tx("bulkSiteWideChangesCan"),
    where: tx("yourWordpressAdminAfterInstalling"),
    steps: [
      tx("installTheSeoToolBridge"),
      tx("pasteYourToolSBridge"),
      tx("auditResultsShowApplyVia"),
      tx("clickApplyPluginPatchesThe"),
    ],
    link: { label: tx("settingsWordpressBridge"), href: "/settings" },
  },
  {
    title: tx("outreachForGuestPosts"),
    whyManual:
      tx("personalizationWinsWeAutoPersonalize"),
    where: tx("outreachHubGmailOrYour"),
    steps: [
      tx("findGuestPostTargetsIn"),
      tx("useTheOutreachPersonalizerTool"),
      tx("sendFromYourRealInbox"),
      tx("logTheContactInOutreach"),
    ],
    link: { label: tx("outreachHub"), href: "/outreach" },
  },
  {
    title: tx("verifyNapConsistencyAcrossCitations"),
    whyManual:
      tx("mostDirectoriesRequireAPhone"),
    where: tx("eachCitationSiteYouVe"),
    steps: [
      tx("afterSubmittingCheckEmailFor"),
      "Phone-verify where requested.",
      tx("after46WeeksRun"),
    ],
    link: { label: tx("localCitationsTool"), href: "/citations" },
  },
]);

export default async function AutomationsOverviewPage() {
  const tx = await getTranslations("ui.app_automations_overview_page");
  // Pull last-run timestamps for automations that have them
  const lastRunTs = await getSetting<number>(
    "daily_agent_runner.last_run",
  ).catch(() => null);
  const lastDailyAgent =
    typeof lastRunTs === "number" ? new Date(lastRunTs) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link
        href="/automations"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> {tx("backToAutomations")}
      </Link>

      <PageHeader
        title={tx("whatSAutomatedWhatS")}
        description={tx("aCompleteMapOfEvery")}
        icon={Workflow}
        accent="cyan"
      />

      <SchedulerStatusPanel />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">{tx("automatedByTheTool")}</h2>
            <p className="text-[11px] text-muted-foreground">
              {tx("theseRunOnTheirOwn")}
            </p>
          </div>
          {lastDailyAgent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <Clock className="size-3" />
              {tx("dailyAgentLastRanMin", { Math: Math.round(
                (Date.now() - lastDailyAgent.getTime()) / 60000,
              ) })}
            </span>
          )}
        </header>
        <ul className="divide-y divide-white/[0.06]">
          {AUTOMATIONS(tx).map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.id} className="flex items-start gap-3 px-5 py-4">
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-xl bg-${a.accent}-500/15 ring-1 ring-inset ring-${a.accent}-500/30`}
                >
                  <Icon className={`size-4 text-${a.accent}-300`} />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-sm">{a.title}</p>
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-inset ring-white/10">
                      {tx.has(`cadence.${CADENCE_KEY[a.cadence]}`)
                        ? tx(`cadence.${CADENCE_KEY[a.cadence]}`)
                        : a.cadence}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {a.whereToSee && (
                    <Link
                      href={a.whereToSee.href}
                      className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                    >
                      {tx("seeOutputIn", { label: a.whereToSee.label })}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="border-b border-white/[0.06] px-5 py-3">
          <h2 className="text-sm font-semibold">{tx("tasksThatNeedYouWith")}</h2>
          <p className="text-[11px] text-muted-foreground">
            {tx("forEachWhyItS")}
          </p>
        </header>
        <ul className="divide-y divide-white/[0.06]">
          {MANUAL_GUIDES(tx).map((g, i) => (
            <li key={i} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-inset ring-amber-500/30">
                  <HandMetal className="size-4 text-amber-300" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-medium">{g.title}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-amber-500/5 p-2 text-[11px] ring-1 ring-inset ring-amber-500/20">
                      <p className="font-medium text-amber-300">{tx("whyItSManual")}</p>
                      <p className="text-muted-foreground">{g.whyManual}</p>
                    </div>
                    <div className="rounded-md bg-emerald-500/5 p-2 text-[11px] ring-1 ring-inset ring-emerald-500/20">
                      <p className="font-medium text-emerald-300 inline-flex items-center gap-1">
                        <Globe className="size-3" /> {tx("where")}
                      </p>
                      <p className="text-muted-foreground">{g.where}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      {tx("howStepByStep")}
                    </p>
                    <ol className="space-y-1 text-xs">
                      {g.steps.map((s, j) => (
                        <li key={j} className="flex items-start gap-1.5">
                          <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[9px] font-bold text-violet-300 ring-1 ring-inset ring-violet-500/30">
                            {j + 1}
                          </span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  {g.link && (
                    <Link
                      href={g.link.href}
                      className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                    >
                      {g.link.label} →
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 text-xs text-muted-foreground">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          {tx("wantItMoreAutomated")}
        </h3>
        <p className="leading-relaxed">
          {tx.rich("buildACustomWorkflowOn", { b0: (chunks) => <Link href="/automations" className="text-violet-300 hover:underline">{chunks}</Link>, b1: (chunks) => <Link href="/settings" className="text-violet-300 hover:underline">{chunks}</Link> })}
        </p>
      </section>
    </div>
  );
}
