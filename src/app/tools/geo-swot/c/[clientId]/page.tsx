export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { Target } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { generateGeoSwot } from "@/lib/geo-swot";
import { configuredProviders } from "@/lib/api-keys";

/**
 * Per-client GEO SWOT report. Runs generateGeoSwot() on the current
 * client (last 30d of AI visibility checks + tracked competitors) and
 * renders the S/W/O/T + summary + deterministic evidence footer.
 *
 * Generation happens server-side on every page hit (cheap — the LLM
 * call is ~1000 output tokens on average). Users can refresh the page
 * to re-generate. No caching layer yet; if performance becomes an
 * issue we can cache the last-generated SWOT per client per day.
 */
export default async function PerClientGeoSwotPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const t = await getTranslations("tools.ui.geo-swot");
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();


  const { ids: providersConfigured } = await configuredProviders();
  const hasAiProvider = providersConfigured.length > 0;

  const swot = hasAiProvider
    ? await generateGeoSwot({ clientId, windowDays: 30, locale: await getLocale() })
    : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">

      <PageHeader
        title={t("clientTitle", { name: client.name })}
        description={t("clientDescription")}
        icon={Target}
        accent="rose"
      />

      {!hasAiProvider && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
          <div className="mb-1 font-semibold">{t("noProviderTitle")}</div>
          <p>
            {t.rich("noProviderBody", {
              link: (chunks) => (
                <a href="/settings#ai" className="underline">{chunks}</a>
              ),
            })}
          </p>
        </div>
      )}

      {swot && (
        <>
          {/* Executive summary */}
          <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="size-1.5 rounded-full bg-violet-400" />
              {t("summary")}
            </h3>
            <p className="text-sm leading-relaxed">
              {swot.summary || t("noSummary")}
            </p>
            {swot.source === "template" && (
              <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
                {t("templateFallback")}
              </span>
            )}
          </section>

          {/* 2x2 SWOT grid */}
          <div className="grid gap-4 md:grid-cols-2">
            <QuadrantCard
              title={t("strengths")}
              emptyLabel={t("noStrengths")}
              tone="emerald"
              items={swot.strengths}
            />
            <QuadrantCard
              title={t("weaknesses")}
              emptyLabel={t("noWeaknesses")}
              tone="rose"
              items={swot.weaknesses}
            />
            <QuadrantCard
              title={t("opportunities")}
              emptyLabel={t("noOpportunities")}
              tone="cyan"
              items={swot.opportunities}
            />
            <QuadrantCard
              title={t("threats")}
              emptyLabel={t("noThreats")}
              tone="amber"
              items={swot.threats}
            />
          </div>

          {/* Deterministic evidence footer (cite-or-bust pattern) */}
          {swot.dataPoints.length > 0 && (
            <details className="rounded-xl border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.04]">
              <summary className="cursor-pointer select-none px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
                {t("dataBehind", { count: swot.dataPoints.length })}
              </summary>
              <ul className="space-y-1 border-t border-white/[0.06] px-4 py-3 text-[12px]">
                {swot.dataPoints.map((dp, i) => (
                  <li key={i} className="flex gap-2 leading-relaxed">
                    <span className="shrink-0 font-medium text-muted-foreground">
                      {dp.label}:
                    </span>
                    <span className="text-foreground/90">{dp.value}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <a
              href="?"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {t("refresh")}
            </a>
          </div>
        </>
      )}
    </div>
  );
}

const TONE_CLASSES: Record<string, { ring: string; bg: string; text: string; dot: string }> = {
  emerald: {
    ring: "ring-emerald-500/30",
    bg: "bg-emerald-500/5",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
  },
  rose: {
    ring: "ring-rose-500/30",
    bg: "bg-rose-500/5",
    text: "text-rose-300",
    dot: "bg-rose-400",
  },
  cyan: {
    ring: "ring-cyan-500/30",
    bg: "bg-cyan-500/5",
    text: "text-cyan-300",
    dot: "bg-cyan-400",
  },
  amber: {
    ring: "ring-amber-500/30",
    bg: "bg-amber-500/5",
    text: "text-amber-300",
    dot: "bg-amber-400",
  },
};

function QuadrantCard({
  title,
  emptyLabel,
  items,
  tone,
}: {
  title: string;
  emptyLabel: string;
  items: string[];
  tone: "emerald" | "rose" | "cyan" | "amber";
}) {
  const c = TONE_CLASSES[tone];
  return (
    <section
      className={`glass-apple relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset ${c.ring} ${c.bg}`}
    >
      <h3 className={`flex items-center gap-2 text-sm font-semibold ${c.text}`}>
        <span className={`size-1.5 rounded-full ${c.dot}`} />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className={`shrink-0 ${c.text}`}>·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
