import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  RefreshCw,
  ScanLine,
  Settings,
  ShieldAlert,
  Target,
  TrendingDown,
  Workflow,
  Globe,
  HandMetal,
} from "lucide-react";
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

const AUTOMATIONS: Automation[] = [
  {
    id: "daily-agent",
    title: "Daily SEO agent",
    cadence: "every 24h",
    icon: Bot,
    accent: "violet",
    description:
      "Walks every active client and runs 17 automated steps — audit refresh on stale clients, news ingest, AI suggestions, brand monitoring, metric snapshots, watchlist alerts, mention digest, competitor monitor, lost-link check, scheduled local grids, outreach reply polling, anomaly detection, title-test rotation, robots.txt snapshot, sitemap health, traffic-drop alert.",
    lastRunKey: "daily_agent_runner.last_run",
    whereToSee: { label: "Activity log", href: "/activity" },
  },
  {
    id: "weekly-rank-sweep",
    title: "Weekly rank sweep",
    cadence: "weekly (Monday)",
    icon: Target,
    accent: "emerald",
    description:
      "Every Monday: re-checks all striking-distance keywords (positions 4-15) and persists new ranks per device.",
    whereToSee: { label: "Keywords dashboard", href: "/keywords" },
  },
  {
    id: "weekly-ai-audit",
    title: "Weekly AI site audit",
    cadence: "weekly (Monday)",
    icon: ScanLine,
    accent: "violet",
    description:
      "Re-runs the AI audit (E-E-A-T, helpful content, structure, schema) for each client; surfaces drift from last week.",
    whereToSee: { label: "Audits", href: "/audits" },
  },
  {
    id: "weekly-serp-features",
    title: "Weekly SERP feature snapshot",
    cadence: "weekly (Monday)",
    icon: Calendar,
    accent: "cyan",
    description:
      "Captures SERP feature presence (AI Overview, Featured Snippet, Local Pack, PAA) for tracked queries — so you see when Google adds/removes them.",
    whereToSee: { label: "SERP features", href: "/tools/serp-features" },
  },
  {
    id: "page-monitor",
    title: "Page change monitor",
    cadence: "every check-in",
    icon: ShieldAlert,
    accent: "amber",
    description:
      "Watches title, H1, meta, structured data on tracked pages. Diff + alert when anything important changes.",
    whereToSee: { label: "Monitor", href: "/monitor" },
  },
  {
    id: "uptime-check",
    title: "Uptime monitor",
    cadence: "every check-in",
    icon: CheckCircle2,
    accent: "emerald",
    description:
      "HTTP-status + response-time check across all monitored URLs. Alerts on 5xx, 4xx, or significant latency spikes.",
    whereToSee: { label: "Uptime tool", href: "/tools/uptime" },
  },
  {
    id: "report-mailer",
    title: "Scheduled report delivery",
    cadence: "on event",
    icon: Mail,
    accent: "violet",
    description:
      "When a scheduled report time rolls around, generates the PDF + executive summary and emails it to the recipient list.",
    whereToSee: { label: "Reports", href: "/reports" },
  },
  {
    id: "metric-snapshots",
    title: "Client metric snapshots",
    cadence: "every 24h",
    icon: TrendingDown,
    accent: "cyan",
    description:
      "Daily snapshot of every client's health score, organic clicks, average rank, top-10 count, critical issues. Powers all the dashboards' trend lines.",
    whereToSee: { label: "Snapshots", href: "/snapshots" },
  },
  {
    id: "morning-briefing",
    title: "Morning briefing",
    cadence: "every 24h",
    icon: RefreshCw,
    accent: "amber",
    description:
      "Pre-renders the priority list, top 3 metrics, what-changed feed across all clients before you open the app.",
    whereToSee: { label: "Dashboard", href: "/" },
  },
];

type ManualGuide = {
  title: string;
  whyManual: string;
  where: string;
  steps: string[];
  link?: { label: string; href: string };
};

const MANUAL_GUIDES: ManualGuide[] = [
  {
    title: "Submit to backlink directories",
    whyManual:
      "Most directories require a human form fill, phone verification, or editorial approval. We can't legally automate every submission.",
    where: "Your library of curated prospects (35+ countries) + our suggestions per client.",
    steps: [
      "Open the Backlink prospects library.",
      "Filter by your country + niche + cost (start with 'free' + DA ≥ 40).",
      "For each prospect: click 'Open' to load the site, click 'How to submit' for steps, submit, then track it in /backlinks.",
      "Goal: 3-5 submissions/week is enough — quality > quantity.",
    ],
    link: {
      label: "Open prospects library",
      href: "/link-building/library",
    },
  },
  {
    title: "Claim Google Business Profile",
    whyManual:
      "Google requires postcard, phone, video, or document verification — there's no API to bypass it.",
    where: "google.com/business",
    steps: [
      "Go to google.com/business.",
      "Add your business with the EXACT name, address, phone as on your site.",
      "Verify (postcard takes 5-14 days; phone/video is instant for eligible businesses).",
      "Add categories, photos, services, hours.",
      "Post a weekly update — Google ranks active GBPs higher.",
    ],
    link: { label: "GBP toolkit", href: "/gbp" },
  },
  {
    title: "Connect Google Search Console",
    whyManual:
      "GSC needs you to verify domain ownership — we can't do this remotely.",
    where: "Settings → Integrations → Google Search Console",
    steps: [
      "Open Settings → Integrations.",
      "Click 'Connect Google account'.",
      "Approve the GSC + GA4 read scopes.",
      "Pick your GSC property + GA4 property per client.",
      "Wait 24h for the first sync to backfill 28 days of data.",
    ],
    link: { label: "Settings → Integrations", href: "/settings#integrations" },
  },
  {
    title: "Apply for HARO / Connectively responses",
    whyManual:
      "Journalist queries are time-sensitive (sub-2h response wins) and require human judgment + factual accuracy.",
    where: "connectively.us or qwoted.com",
    steps: [
      "Subscribe to Connectively for your beats.",
      "When a query lands, reply within 30-120 minutes.",
      "300 words max with a 1-line credentialed bio.",
      "Include 1 specific link + a quotable line.",
      "Track wins in /backlinks as they go live.",
    ],
    link: { label: "Open backlinks tracker", href: "/backlinks" },
  },
  {
    title: "Apply WordPress fixes via plugin",
    whyManual:
      "Bulk site-wide changes can break things — the plugin requires a human click-Apply for each.",
    where: "Your WordPress admin (after installing the SEO Tool Bridge plugin)",
    steps: [
      "Install the SEO Tool Bridge plugin from your WP admin.",
      "Paste your tool's bridge key (from Settings → Integrations).",
      "Audit results show 'Apply via WP' buttons on title/meta/alt fixes.",
      "Click Apply — plugin patches the post + saves a revision for one-click undo.",
    ],
    link: { label: "Settings → WordPress bridge", href: "/settings" },
  },
  {
    title: "Outreach for guest posts",
    whyManual:
      "Personalization wins. We auto-personalize the message, but you still hit Send and handle replies.",
    where: "Outreach hub + Gmail (or your inbox)",
    steps: [
      "Find guest-post targets in the Prospects library (filter: 'guest-post' category).",
      "Use the Outreach personalizer tool to draft the pitch with site-specific hooks.",
      "Send from your real inbox (Gmail / Outlook) for deliverability.",
      "Log the contact in /outreach so we poll for replies.",
    ],
    link: { label: "Outreach hub", href: "/outreach" },
  },
  {
    title: "Verify NAP consistency across citations",
    whyManual:
      "Most directories require a phone/email confirmation per listing.",
    where: "Each citation site you've submitted to",
    steps: [
      "After submitting, check email for verification links.",
      "Phone-verify where requested.",
      "After 4-6 weeks, run /tools/local-cwv with your NAP to spot inconsistencies.",
    ],
    link: { label: "Local citations tool", href: "/citations" },
  },
];

export default async function AutomationsOverviewPage() {
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
        <ArrowLeft className="size-3" /> Back to automations
      </Link>

      <PageHeader
        title="What's automated · what's manual"
        description="A complete map of every task this tool runs on its own + every task that needs your hand. For manual tasks, you get the where + how step-by-step. No black box."
        icon={Workflow}
        accent="cyan"
      />

      <SchedulerStatusPanel />

      <section className="glass-apple relative overflow-hidden rounded-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold">Automated by the tool</h2>
            <p className="text-[11px] text-muted-foreground">
              These run on their own — you don't need to remember.
            </p>
          </div>
          {lastDailyAgent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <Clock className="size-3" />
              Daily agent last ran{" "}
              {Math.round(
                (Date.now() - lastDailyAgent.getTime()) / 60000,
              )}{" "}
              min ago
            </span>
          )}
        </header>
        <ul className="divide-y divide-white/[0.06]">
          {AUTOMATIONS.map((a) => {
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
                      {a.cadence}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {a.whereToSee && (
                    <Link
                      href={a.whereToSee.href}
                      className="inline-flex items-center gap-1 text-[11px] text-violet-300 hover:underline"
                    >
                      See output in {a.whereToSee.label} →
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
          <h2 className="text-sm font-semibold">Tasks that need you (with guides)</h2>
          <p className="text-[11px] text-muted-foreground">
            For each: why it's manual, where you do it, and a numbered how-to.
          </p>
        </header>
        <ul className="divide-y divide-white/[0.06]">
          {MANUAL_GUIDES.map((g, i) => (
            <li key={i} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 ring-1 ring-inset ring-amber-500/30">
                  <HandMetal className="size-4 text-amber-300" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-medium">{g.title}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-amber-500/5 p-2 text-[11px] ring-1 ring-inset ring-amber-500/20">
                      <p className="font-medium text-amber-300">Why it's manual</p>
                      <p className="text-muted-foreground">{g.whyManual}</p>
                    </div>
                    <div className="rounded-md bg-emerald-500/5 p-2 text-[11px] ring-1 ring-inset ring-emerald-500/20">
                      <p className="font-medium text-emerald-300 inline-flex items-center gap-1">
                        <Globe className="size-3" /> Where
                      </p>
                      <p className="text-muted-foreground">{g.where}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      How — step by step
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
          Want it more automated?
        </h3>
        <p className="leading-relaxed">
          Build a custom workflow on{" "}
          <Link href="/automations" className="text-violet-300 hover:underline">
            /automations
          </Link>{" "}
          — trigger an action on any event (rank drop, page change, new
          backlink, audit issue surfaced) and chain it to Slack, email,
          webhook, or a task auto-created for your team. Plus the{" "}
          <Link href="/settings" className="text-violet-300 hover:underline">
            Settings → AI
          </Link>{" "}
          page lets you pick which AI provider runs the AI-driven automation.
        </p>
      </section>
    </div>
  );
}
