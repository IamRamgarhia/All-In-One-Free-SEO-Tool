export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  CheckCircle2,
  Compass,
  Link2,
  Sparkles,
} from "lucide-react";
import { db } from "@/db/client";
import {
  clients,
  resourceSubmissions,
  seoResources,
} from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ensureSeoResourcesSeeded } from "@/lib/seo-resources-loader";
import {
  scoreNicheProspects,
  type ScoredProspect,
} from "@/lib/backlink-niche-matcher";
import {
  difficultyEffortHint,
  difficultyTone,
} from "@/lib/backlink-difficulty";
import { getLocale, getTranslations } from "next-intl/server";
import { ClientLinkBuildingHub } from "./hub";

export default async function ClientLinkBuildingPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: clientIdRaw } = await params;
  const clientId = Number(clientIdRaw);
  if (!Number.isFinite(clientId) || clientId <= 0) notFound();

  await ensureSeoResourcesSeeded();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const locale = await getLocale();
  // AI-deterministic prospect scoring (no AI cost)
  const ranked = await scoreNicheProspects(
    {
      niche: client.niche,
      city: client.city,
      country: client.country,
      businessType: client.businessType,
      description: client.description,
    },
    80,
    locale,
  );

  // Already tracked for this client
  const tracked = await db
    .select({
      id: resourceSubmissions.id,
      resourceId: resourceSubmissions.resourceId,
      status: resourceSubmissions.status,
      submittedUrl: resourceSubmissions.submittedUrl,
      submittedAt: resourceSubmissions.submittedAt,
      createdAt: resourceSubmissions.createdAt,
      url: seoResources.url,
      domain: seoResources.domain,
      category: seoResources.category,
      da: seoResources.da,
    })
    .from(resourceSubmissions)
    .leftJoin(seoResources, eq(resourceSubmissions.resourceId, seoResources.id))
    .where(eq(resourceSubmissions.clientId, clientId))
    .orderBy(desc(resourceSubmissions.createdAt));

  const trackedIds = new Set(tracked.map((t) => t.resourceId));
  const unTrackedRanked = ranked.filter((r) => !trackedIds.has(r.resource.id));

  // 30-day stats
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentLive = await db
    .select({ id: resourceSubmissions.id })
    .from(resourceSubmissions)
    .where(
      and(
        eq(resourceSubmissions.clientId, clientId),
        eq(resourceSubmissions.status, "live"),
        gte(resourceSubmissions.submittedAt, cutoff),
      ),
    );
  const totalLive = tracked.filter((t) => t.status === "live").length;
  const totalActive = tracked.length;
  const t = await getTranslations("linksTab.linkBuilding.page");

  return (
    <div className="mx-auto max-w-7xl space-y-6">

      <PageHeader
        title={t("title", { name: client.name })}
        description={t("description")}
        icon={Link2}
        accent="emerald"
        meta={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              <CheckCircle2 className="size-3" />
              {t("liveLinks", { count: totalLive })}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-violet-300 ring-1 ring-inset ring-violet-500/30">
              <Sparkles className="size-3" />
              {t("builtLast30d", { count: recentLive.length })}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-muted-foreground ring-1 ring-inset ring-white/10">
              {t("onTracker", { count: totalActive })}
            </span>
            <Link
              href={`/guest-posts/c/${clientId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/20"
            >
              <Compass className="size-3" />
              {t("guestPostComposer")}
            </Link>
          </div>
        }
      />

      <ClientLinkBuildingHub
        clientId={clientId}
        ranked={unTrackedRanked}
        tracked={tracked}
        clientName={client.name}
      />

      <ClientStaticHelp ranked={ranked} />
    </div>
  );
}

async function ClientStaticHelp({ ranked }: { ranked: ScoredProspect[] }) {
  const t = await getTranslations("linksTab.linkBuilding.page");
  const locale = await getLocale();
  const easy = ranked.filter((r) => r.difficulty === "easy").length;
  const medium = ranked.filter((r) => r.difficulty === "medium").length;
  const hard = ranked.filter((r) => r.difficulty === "hard").length;

  return (
    <section className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md">
      <h3 className="text-sm font-semibold">{t("difficultyTitle")}</h3>
      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
        <Tone label={t("difficulty.easy")} diff="easy" count={easy} locale={locale} />
        <Tone label={t("difficulty.medium")} diff="medium" count={medium} locale={locale} />
        <Tone label={t("difficulty.hard")} diff="hard" count={hard} locale={locale} />
      </div>
    </section>
  );
}

function Tone({
  label,
  diff,
  count,
  locale,
}: {
  label: string;
  diff: "easy" | "medium" | "hard";
  count: number;
  locale: string;
}) {
  return (
    <div
      className={`rounded-xl border border-white/5 bg-black/20 p-3 ring-1 ring-inset ${difficultyTone(diff)}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider opacity-80">
          {label}
        </span>
        <span className="font-semibold tabular-nums">{count}</span>
      </div>
      <p className="mt-1.5 text-[11px] opacity-80">{difficultyEffortHint(diff, locale)}</p>
    </div>
  );
}

