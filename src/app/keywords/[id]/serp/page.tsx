export const dynamic = "force-dynamic";

import { getTranslations, getLocale } from "next-intl/server";
import { AskAiButton } from "@/components/ask-ai-button";
import { useTranslations, useLocale } from "next-intl";
import { notFound } from "next/navigation";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Globe,
  Map,
  Radar,
  Sparkles,
  Trophy,
} from "lucide-react";
import { db } from "@/db/client";
import { clients, keywords, serpScans } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";

export default async function SerpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tx = await getTranslations("ui.app_keywords_id_serp_page");
  const { id } = await params;
  const keywordId = Number(id);
  if (!Number.isFinite(keywordId)) notFound();

  const [k] = await db
    .select()
    .from(keywords)
    .where(eq(keywords.id, keywordId))
    .limit(1);
  if (!k) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, k.clientId))
    .limit(1);

  const scans = await db
    .select()
    .from(serpScans)
    .where(eq(serpScans.keywordId, keywordId))
    .orderBy(desc(serpScans.scannedAt));

  const latest = scans[0] ?? null;
  const tAsk = await getTranslations("askAi");
  const locale = await getLocale();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={client ? `/keywords/c/${client.id}` : "/keywords"}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        {tx("backToKeywords")}
      </Link>

      <PageHeader
        title={tx("serpIntel", { query: k.query })}
        description={
          client
            ? tx("liveGoogleSearchAnalysisFor", { name: client.name, country: k.country, device: k.device })
            : tx("countryDevice", { country: k.country, device: k.device })
        }
        icon={Radar}
        accent="violet"
        actions={
          client ? (
            <AskAiButton
              clientId={client.id}
              question={tAsk("keyword")}
              context={tAsk("keywordContext", { query: k.query, country: k.country, device: k.device, name: client.name })}
            />
          ) : undefined
        }
      />

      {!latest ? (
        <div className="glass-apple relative overflow-hidden rounded-2xl px-6 py-12 text-center text-sm text-muted-foreground">
          {tx("noSerpScansYetRun")}
        </div>
      ) : (
        <ScanCard scan={latest} client={client ?? null} />
      )}

      {scans.length > 1 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="text-base font-semibold">{tx("scanHistory")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tx("trackHowTheSerpHas")}
            </p>
          </header>
          <ul className="divide-y divide-white/[0.04]">
            {scans.slice(1).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {s.scannedAt.toLocaleString(locale)}
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                    <span>{tx("results", { v: s.topResults?.length ?? 0 })}</span>
                    {s.aiOverviewPresent && (
                      <span className="text-violet-300">{tx("aiOverview")}</span>
                    )}
                    {s.featuredSnippet && (
                      <span className="text-amber-300">{tx("featuredSnippet")}</span>
                    )}
                    {s.localPackPresent && (
                      <span className="text-cyan-300">{tx("localPack")}</span>
                    )}
                    {!s.ok && (
                      <span className="text-rose-300">{tx("failed")}</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ScanCard({
  scan,
  client,
}: {
  scan: {
    id: number;
    ok: boolean;
    error: string | null;
    aiOverviewPresent: boolean;
    aiOverviewText: string | null;
    aiOverviewSources: string[] | null;
    paaQuestions: string[] | null;
    relatedSearches: string[] | null;
    topResults:
      | {
          position: number;
          title: string;
          url: string;
          domain: string;
          snippet: string | null;
          isClient: boolean;
        }[]
      | null;
    featuredSnippet:
      | { title: string; url: string; excerpt: string | null }
      | null;
    localPackPresent: boolean;
    totalResults: number | null;
    scannedAt: Date;
  };
  client: { url: string; name: string } | null;
}) {
  const tx = useTranslations("ui.app_keywords_id_serp_page");
  const locale = useLocale();
  if (!scan.ok) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">{tx("scanFailed")}</div>
            <div className="mt-0.5 text-xs">{scan.error ?? tx("unknownError")}</div>
            <div className="mt-2 text-[11px] text-rose-200/70">
              {tx("runAgainGoogleSometimesBlocks")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const clientPosition = scan.topResults?.find((r) => r.isClient)?.position;

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={tx("topResults")}
          value={String(scan.topResults?.length ?? 0)}
          tone="violet"
          hint={scan.totalResults ? `of ~${scan.totalResults.toLocaleString(locale)}` : undefined}
        />
        <Tile
          label={tx("aiOverview2")}
          value={scan.aiOverviewPresent ? tx("present") : tx("notShown")}
          tone={scan.aiOverviewPresent ? "rose" : "neutral"}
          hint={
            scan.aiOverviewSources && scan.aiOverviewSources.length > 0
              ? tx("sourcesCited", { length: scan.aiOverviewSources.length })
              : undefined
          }
        />
        <Tile
          label={tx("yourPosition")}
          value={clientPosition ? `#${clientPosition}` : tx("notInTop10")}
          tone={clientPosition ? "emerald" : "neutral"}
          hint={client ? `for ${client.name}` : undefined}
        />
        <Tile
          label={tx("scanned")}
          value={scan.scannedAt.toLocaleDateString(locale)}
          tone="neutral"
          hint={scan.scannedAt.toLocaleTimeString(locale)}
        />
      </div>

      {/* AI Overview */}
      {scan.aiOverviewPresent && scan.aiOverviewText && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-rose-500/15 blur-3xl" />
          <header className="relative border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-4 text-rose-300" />
              {tx.rich("aiOverviewCaptured", { b0: (chunks) => <span className="ml-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30">{chunks}</span> })}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tx("googleSAiGeneratedAnswer")}
            </p>
          </header>
          <div className="relative space-y-3 p-5">
            <div className="rounded-md border border-rose-500/15 bg-rose-500/5 p-3 text-sm text-foreground/90 whitespace-pre-wrap">
              {scan.aiOverviewText}
            </div>
            {scan.aiOverviewSources && scan.aiOverviewSources.length > 0 && (
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {tx("sourcesCited2")}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {scan.aiOverviewSources.map((s, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-inset ring-white/10"
                    >
                      <Globe className="size-3" />
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Top organic results */}
      {scan.topResults && scan.topResults.length > 0 && (
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Trophy className="size-4 text-amber-300" />
              {tx("topOrganicResults", { length: scan.topResults.length })}
            </h2>
          </header>
          <ol className="divide-y divide-white/[0.04]">
            {scan.topResults.map((r) => (
              <li
                key={r.position}
                className={`flex items-start gap-4 px-5 py-3 transition-colors hover:bg-white/[0.02] ${
                  r.isClient ? "bg-emerald-500/[0.03]" : ""
                }`}
              >
                <span
                  className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold tabular-nums ring-1 ring-inset ${
                    r.position <= 3
                      ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                      : r.position <= 10
                        ? "bg-violet-500/10 text-violet-300 ring-violet-500/30"
                        : "bg-white/5 text-muted-foreground ring-white/10"
                  }`}
                >
                  {r.position}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 truncate text-sm font-medium hover:underline"
                  >
                    {r.title}
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </a>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={`truncate ${r.isClient ? "font-semibold text-emerald-300" : "text-muted-foreground"}`}
                    >
                      {r.domain}
                    </span>
                    {r.isClient && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                        <CheckCircle2 className="size-2.5" />
                        {tx("you")}
                      </span>
                    )}
                  </div>
                  {r.snippet && (
                    <div className="line-clamp-2 text-xs text-muted-foreground">
                      {r.snippet}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* PAA + Related searches side by side */}
      <div className="grid gap-4 lg:grid-cols-2">
        {scan.paaQuestions && scan.paaQuestions.length > 0 && (
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">{tx("peopleAlsoAsk")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tx("questionsGoogleSurfacesForThis")}
              </p>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {scan.paaQuestions.map((q, i) => (
                <li key={i} className="px-5 py-2.5 text-sm">
                  {q}
                </li>
              ))}
            </ul>
          </section>
        )}

        {scan.relatedSearches && scan.relatedSearches.length > 0 && (
          <section className="glass-apple relative overflow-hidden rounded-2xl">
            <header className="border-b border-white/[0.06] px-5 py-4">
              <h2 className="text-base font-semibold">{tx("relatedSearches")}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {tx("adjacentIntentsToConsiderAs")}
              </p>
            </header>
            <ul className="divide-y divide-white/[0.04]">
              {scan.relatedSearches.map((q, i) => (
                <li key={i} className="px-5 py-2.5 text-sm">
                  {q}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Featured snippet + local pack */}
      <div className="grid gap-4 lg:grid-cols-2">
        {scan.featuredSnippet && (
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Trophy className="size-4 text-amber-300" />
              {tx("featuredSnippet2")}
            </h2>
            <p className="mt-2 text-sm font-medium">
              {scan.featuredSnippet.title}
            </p>
            <a
              href={scan.featuredSnippet.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {new URL(scan.featuredSnippet.url).hostname}
            </a>
            {scan.featuredSnippet.excerpt && (
              <p className="mt-2 text-xs text-muted-foreground">
                {scan.featuredSnippet.excerpt}
              </p>
            )}
          </section>
        )}

        {scan.localPackPresent && (
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Map className="size-4 text-cyan-300" />
              {tx("localPack2")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tx("the3PackWithMap")}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "violet" | "emerald" | "amber" | "cyan" | "rose" | "neutral";
  hint?: string;
}) {
  const cls = {
    violet: "text-gradient-violet",
    emerald: "text-gradient-emerald",
    amber: "text-gradient-amber",
    cyan: "text-gradient-cyan",
    rose: "text-gradient-rose",
    neutral: "text-foreground",
  }[tone];
  return (
    <div className="glass-apple relative overflow-hidden rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}
