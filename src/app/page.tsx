import { db } from "@/db/client";
import { clients } from "@/db/schema";

export const dynamic = "force-dynamic";

import { count, inArray, type AnyColumn } from "drizzle-orm";
import { scopedClientIds } from "@/lib/client-scope";
import {
  ArrowUpRight,
  Bot,
  ClipboardList,
  FileDown,
  Link2,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MaintainerCredit } from "@/components/shell/maintainer-credit";
import Link from "next/link";
import { PortfolioTrafficPanel } from "./portfolio-traffic-panel";
import { MorningBriefing } from "./morning-briefing";
import { AgencyWeekInReview } from "./agency-week";
import { OnboardingChecklistPanel } from "./onboarding-checklist-panel";
import { AutonomyPrompt } from "./autonomy-prompt";
import { InstallHealthBanner } from "./install-health-banner";
import { PortfolioOverview } from "./portfolio-overview";
import { startScheduler, tickScheduler } from "@/lib/scheduler";
import { redirect } from "next/navigation";
import { getSetting } from "@/lib/settings-store";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ vue?: string }>;
}) {
  const t = await getTranslations("dashboard");
  const { vue } = await searchParams;

  // The background runners live in the scheduler now (src/lib/scheduler.ts),
  // on a real interval, so they keep running whether or not anyone opens
  // this page. We still nudge it here: it costs nothing when everything is
  // current, and it makes a just-restarted process catch up on this render.
  //
  // try/catch AND .catch() because a synchronous throw (native module
  // fails to load, DB binding missing on a half-built install) escapes
  // the await chain entirely and would 500 the dashboard. The dashboard
  // MUST always render so users can see what's wrong.
  try {
    startScheduler();
    tickScheduler().catch(() => {});
  } catch {}

  // Members and client viewers see their assigned clients only.
  const scope = await scopedClientIds();
  const scoped = scope !== null;
  const inScope = (column: AnyColumn) =>
    scope === null
      ? undefined
      : inArray(column, scope.length > 0 ? scope : [-1]);

  const [{ value: clientCount }] = await db
    .select({ value: count() })
    .from(clients)
    .where(inScope(clients.id));

  // "Fresh" means a new workspace, not a member with no assignments yet.
  const isFresh = clientCount === 0 && !scoped;

  // First-run gate. A genuinely fresh workspace lands on /welcome where
  // the stepper makes the next action obvious, until it is dismissed.
  if (isFresh) {
    const dismissedAt = await getSetting<string>("onboarding.dismissed_at").catch(() => null);
    if (!dismissedAt) {
      redirect("/welcome");
    }
  }

  if (!isFresh) {
    // The portfolio: every project, what to do today, two charts. The
    // panels below it are the agency-wide ones that were already here.
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Above everything else, owners and managers only: when a
            connection is broken or the work stalls, the dashboard says so
            instead of looking busy. Reads a result stored by the
            scheduler, never the network. Renders nothing when nothing is
            wrong. */}
        {!scoped && (
          <Suspense fallback={null}>
            <InstallHealthBanner />
          </Suspense>
        )}

        <PortfolioOverview view={vue === "cartes" ? "cards" : "list"} />

        {/* Asked once, because it decides whether the agent's work
            reaches the site at all. Renders nothing once answered. */}
        {!scoped && (
          <Suspense fallback={null}>
            <AutonomyPrompt />
          </Suspense>
        )}
        {!scoped && (
          <Suspense fallback={null}>
            <OnboardingChecklistPanel />
          </Suspense>
        )}
        <Suspense fallback={<DashboardPanelSkeleton lines={4} />}>
          <MorningBriefing />
        </Suspense>
        {/* Owners and managers only: not scoped, and a member or client
            viewer must not see other clients. */}
        {!scoped && (
          <>
            <Suspense fallback={<DashboardPanelSkeleton lines={3} />}>
              <AgencyWeekInReview />
            </Suspense>
            <Suspense fallback={<DashboardPanelSkeleton lines={5} />}>
              <PortfolioTrafficPanel />
            </Suspense>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="space-y-3 rounded-xl border border-border bg-card p-6">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground">
          {t("welcomeTitle")}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("welcomeBody")}</p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {/* Lead with the thing that produces a result, not the thing
              that asks for a credential: audits need no AI key. */}
          <Link href="/clients/new" className={buttonVariants()}>
            {t("addFirstSite")}
          </Link>
          <Link
            href="/settings#ai"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {t("orConnectAi")}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={null}>
            <OnboardingChecklistPanel />
          </Suspense>
        </div>
        <FeatureHighlights t={t} />
      </div>

      <BentoQuickActions t={t} />
    </div>
  );
}

type DashboardT = Awaited<ReturnType<typeof getTranslations>>;

type BentoTile = {
  href: string;
  titleKey: "bento.auditsTitle" | "bento.keywordsTitle" | "bento.reportsTitle" | "bento.agentTitle" | "bento.backlinksTitle" | "bento.toolsTitle";
  descKey: "bento.auditsDesc" | "bento.keywordsDesc" | "bento.reportsDesc" | "bento.agentDesc" | "bento.backlinksDesc" | "bento.toolsDesc";
  icon: LucideIcon;
  iconColor: string;
  /** Optional col / row span for the asymmetric Bento layout */
  className?: string;
};

const BENTO_TILES: BentoTile[] = [
  {
    href: "/audits",
    titleKey: "bento.auditsTitle",
    descKey: "bento.auditsDesc",
    icon: ClipboardList,
    iconColor: "text-violet-300",
    className: "md:col-span-2 md:row-span-2",
  },
  {
    href: "/keywords",
    titleKey: "bento.keywordsTitle",
    descKey: "bento.keywordsDesc",
    icon: Search,
    iconColor: "text-cyan-300",
  },
  {
    href: "/reports",
    titleKey: "bento.reportsTitle",
    descKey: "bento.reportsDesc",
    icon: FileDown,
    iconColor: "text-amber-300",
  },
  {
    href: "/agent",
    titleKey: "bento.agentTitle",
    descKey: "bento.agentDesc",
    icon: Bot,
    iconColor: "text-fuchsia-300",
    className: "md:col-span-2",
  },
  {
    href: "/backlinks",
    titleKey: "bento.backlinksTitle",
    descKey: "bento.backlinksDesc",
    icon: Link2,
    iconColor: "text-emerald-300",
  },
  {
    href: "/settings/tools",
    titleKey: "bento.toolsTitle",
    descKey: "bento.toolsDesc",
    icon: Wrench,
    iconColor: "text-rose-300",
  },
];

function BentoQuickActions({ t }: { t: DashboardT }) {
  return (
    <section>
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t("quickActions")}
      </h2>
      <div className="grid auto-rows-[110px] grid-cols-2 gap-3 md:grid-cols-4">
        {BENTO_TILES.map((tile) => {
          const Icon = tile.icon;
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className={`group relative flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent ${tile.className ?? ""}`}
            >
              <Icon className={`size-4 ${tile.iconColor}`} />
              <div>
                <div className="text-[13px] font-semibold text-foreground">
                  {t(tile.titleKey)}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {t(tile.descKey)}
                </div>
              </div>
              <ArrowUpRight className="absolute right-3 top-3 size-3 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/**
 * "What you'll unlock" side panel shown on the fresh dashboard. Replaces
 * the old wordy WelcomeTour with a tighter visual: feature pills + the
 * "100+ tools" stat, anchoring the page right-hand column.
 */
function FeatureHighlights({ t }: { t: DashboardT }) {
  const highlights = [
    { icon: ClipboardList, label: t("highlights.audits"), tone: "text-violet-400" },
    { icon: Search, label: t("highlights.ranks"), tone: "text-cyan-400" },
    { icon: FileDown, label: t("highlights.reports"), tone: "text-amber-400" },
    { icon: Bot, label: t("highlights.agent"), tone: "text-fuchsia-400" },
    { icon: Link2, label: t("highlights.backlinks"), tone: "text-emerald-400" },
    { icon: Wrench, label: t("highlights.tools"), tone: "text-rose-400" },
  ];
  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-violet-400">
          {t("unlockEyebrow")}
        </div>
        <h3 className="mt-1 text-base font-semibold text-foreground">
          {t("unlockTitle")}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("unlockBody")}
        </p>
      </div>
      <ul className="space-y-1.5">
        {highlights.map(({ icon: Icon, label, tone }) => (
          <li
            key={label}
            className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5 text-sm text-foreground"
          >
            <Icon className={`size-3.5 ${tone}`} />
            <span>{label}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-3">
        <div className="rounded-md border border-violet-500/30 bg-violet-500/5 p-3">
          <div className="text-xs font-medium text-violet-300">{t("noPaidApis")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("noPaidApisBody")}
          </p>
        </div>
        {/* Maintainer credit — subtle, links to source + support */}
        <MaintainerCredit variant="inline" />
      </div>
    </aside>
  );
}

function DashboardPanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <section className="rounded-2xl border border-border bg-card/40 p-5">
      <Skeleton.Line className="w-40" />
      <div className="mt-4">
        <Skeleton.Lines count={lines} />
      </div>
    </section>
  );
}
