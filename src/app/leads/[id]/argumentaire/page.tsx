export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db/client";
import { graderLeads } from "@/db/schema";
import { isWhiteLabelled, loadBrand } from "@/lib/brand";
import { buildPitch, type PitchPoint } from "@/lib/sales-pitch";
import { serpApiConfig } from "@/lib/serp-api";
import { PrintButton } from "@/app/clients/[id]/missions/[missionId]/print-button";
import { CompetitorCompare } from "./competitor-compare";

/**
 * The page to show a prospect: their express-audit score, the three
 * problems worth a conversation, the quick wins, and how they compare
 * with the sites Google shows for their trade. Printable (and saved as
 * PDF by the browser), like a mission's specification.
 */
export default async function PitchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) notFound();
  const [lead] = await db.select().from(graderLeads).where(eq(graderLeads.id, leadId)).limit(1);
  if (!lead) notFound();

  const t = await getTranslations("leads.pitch");
  const locale = await getLocale();
  const brand = await loadBrand();
  const agency = isWhiteLabelled(brand) ? brand.name!.trim() : null;
  const pitch = buildPitch(lead.findingsJson ?? [], locale);
  let host = lead.url;
  try {
    host = new URL(lead.url).hostname.replace(/^www\./, "");
  } catch {
    // keep the stored address
  }
  const name = lead.name ?? host;
  const city = lead.notes?.match(/\d{5} ([^·]+?)\s*·/)?.[1]?.trim() ?? "";
  const date = lead.createdAt.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <style>{`@media print {
        body * { visibility: hidden !important; }
        #sales-pitch, #sales-pitch * { visibility: visible !important; }
        #sales-pitch { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0 !important; }
        #sales-pitch .no-print { display: none !important; }
        #sales-pitch section { break-inside: avoid-page; }
      }`}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      <article id="sales-pitch" className="space-y-8 rounded-lg border border-border bg-card p-5 sm:p-10">
        <header className="space-y-1 border-b border-border pb-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("eyebrow")}</p>
          <h1 className="break-words text-2xl font-semibold">{name}</h1>
          <p className="break-words text-sm text-muted-foreground">
            {host} · {t("measured", { date })}
            {agency ? ` · ${t("preparedBy", { agency })}` : ""}
          </p>
        </header>

        <section className="flex flex-wrap items-center gap-5">
          <div className="flex size-24 shrink-0 flex-col items-center justify-center rounded-full border-4 border-primary/60">
            <span className="text-3xl font-semibold tabular-nums">{lead.score ?? "—"}</span>
            <span className="text-[11px] text-muted-foreground">/ 100</span>
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <p className="font-medium">{t("scoreTitle")}</p>
            <p className="text-muted-foreground">
              {t("scoreBody", { critical: lead.criticalCount, high: lead.highCount })}
            </p>
            <p className="text-xs text-muted-foreground">{t("scoreScope")}</p>
          </div>
        </section>

        <PointList title={t("problemsTitle")} empty={t("problemsEmpty")} points={pitch.problems} actionLabel={t("weDo")} />
        {pitch.quickWins.length > 0 ? (
          <PointList title={t("quickWinsTitle")} empty="" points={pitch.quickWins} actionLabel={t("weDo")} />
        ) : null}

        <CompetitorCompare
          prospectUrl={lead.url}
          prospectHost={host}
          prospectScore={lead.score}
          prospectSerious={lead.criticalCount + lead.highCount}
          defaultQuery={city ? `${name} ${city}` : name}
          hasSerpApi={Boolean(await serpApiConfig())}
        />

        <section className="space-y-1 border-t border-border pt-5 text-sm">
          <p className="font-medium">{t("nextTitle")}</p>
          <p className="text-muted-foreground">{t("nextBody")}</p>
        </section>
      </article>
    </div>
  );
}

function PointList({
  title,
  empty,
  points,
  actionLabel,
}: {
  title: string;
  empty: string;
  points: PitchPoint[];
  actionLabel: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold">{title}</h2>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="space-y-3">
          {points.map((p, i) => (
            <li key={p.type} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium first-letter:uppercase">
                {i + 1}. {p.name}
              </p>
              <p className="mt-1 break-words text-muted-foreground">{p.detail}</p>
              <p className="mt-1 text-muted-foreground">{p.cost}</p>
              {p.action ? (
                <p className="mt-1">
                  <span className="font-medium">{actionLabel} </span>
                  {p.action}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
