export const dynamic = "force-dynamic";

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Target } from "lucide-react";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { PageHeader } from "@/components/shell/page-header";
import { ClientToolHeader } from "@/components/shell/client-tool-grid";
import {
  collectGeoSwotInputs,
  interpretGeoSwot,
  type GeoSwot,
  type GeoSwotInputs,
} from "@/lib/geo-swot";
import { configuredProviders } from "@/lib/api-keys";
import { clientScope } from "@/lib/client-scope";

/**
 * Per-client GEO SWOT report: the S/W/O/T, a summary, and the
 * deterministic data points every bullet has to cite.
 *
 * Rendered in two stages, because the two halves cost wildly different
 * amounts. The data points are a handful of indexed SQL reads; the model
 * call that interprets them took 23-31s on this install — and the page
 * used to await both before sending a single byte. The route sweep flags
 * anything past 8s as the point a first-time visitor assumes the page
 * has hung, and this was three times that with nothing on screen.
 *
 * So the shell and the real numbers go out immediately, and the model's
 * reading of them streams in behind a Suspense boundary. The waiting
 * state says what is being waited on and shows the data already in hand,
 * rather than animating a progress bar that knows nothing — there is one
 * model call here, so any "step 2 of 4" would be invented.
 *
 * Still regenerated on every hit, so Refresh is a reload. The comment
 * that used to sit here called the model call "cheap"; it is not, and
 * caching the last one per client per day is the obvious next move if
 * this gets used in anger.
 */
export default async function PerClientGeoSwotPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId: cidStr } = await params;
  const clientId = Number(cidStr);
  if (!Number.isFinite(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) notFound();

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(await clientScope())
    .orderBy(asc(clients.name));

  const { ids: providersConfigured } = await configuredProviders();
  const hasAiProvider = providersConfigured.length > 0;

  // Fast half, awaited here so the evidence is on screen immediately.
  const inputs = await collectGeoSwotInputs({ clientId, windowDays: 30 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientToolHeader
        current={{
          id: client.id,
          name: client.name,
          url: client.url,
          logoUrl: client.logoUrl,
        }}
        allClients={allClients}
        basePath="/tools/geo-swot/c"
        toolLabel="GEO SWOT"
        icon={Target}
      />

      <PageHeader
        title={`GEO SWOT · ${client.name}`}
        description="Strengths / Weaknesses / Opportunities / Threats for AI-search visibility. Every claim traces to a deterministic data point (see the audit footer at bottom)."
        icon={Target}
        accent="rose"
      />

      {!hasAiProvider && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-amber-200">
          <div className="mb-1 font-semibold">No AI provider configured</div>
          <p>
            Add a free Gemini or Groq key in{" "}
            <a href="/settings#ai" className="underline">Settings → AI provider keys</a>{" "}
            and refresh this page.
          </p>
        </div>
      )}

      {hasAiProvider && (
        <>
          {/* The model's reading of the numbers. Streams in; everything
              below it is already on screen while this is still running. */}
          <Suspense fallback={<SwotPending inputs={inputs} />}>
            <SwotNarrative inputs={inputs} clientId={clientId} />
          </Suspense>

          <EvidenceFooter dataPoints={inputs.dataPoints} />

          <div className="flex items-center justify-end gap-2 pt-2">
            <a
              href="?"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Refresh — regenerate SWOT
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The async half. Awaiting here rather than in the page is the whole
 * point: React sends everything around it first and fills this in when
 * the model answers.
 */
async function SwotNarrative({
  inputs,
  clientId,
}: {
  inputs: GeoSwotInputs;
  clientId: number;
}) {
  const swot = await interpretGeoSwot(inputs, clientId);
  return (
    <>
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="size-1.5 rounded-full bg-violet-400" />
          Summary
        </h3>
        <p className="text-sm leading-relaxed">
          {swot.summary || "(no summary generated)"}
        </p>
        {swot.source === "template" && (
          <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30">
            written from the numbers, not by a model — the AI call did not
            return a usable answer
          </span>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <QuadrantCard title="Strengths" tone="emerald" items={swot.strengths} />
        <QuadrantCard title="Weaknesses" tone="rose" items={swot.weaknesses} />
        <QuadrantCard title="Opportunities" tone="cyan" items={swot.opportunities} />
        <QuadrantCard title="Threats" tone="amber" items={swot.threats} />
      </div>
    </>
  );
}

/**
 * What the page shows while the model is thinking.
 *
 * Says the one true thing it knows — a model is being asked to read N
 * data points, and it takes about half a minute — instead of a bare
 * spinner. The quadrant outlines are there so the layout does not jump
 * when the real content replaces them.
 */
function SwotPending({ inputs }: { inputs: GeoSwotInputs }) {
  const n = inputs.dataPoints.length;
  return (
    <>
      <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-violet-400" />
          Summary
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Reading {n} data point{n === 1 ? "" : "s"} from the last 30 days and
          writing the SWOT. This takes around half a minute — the numbers it has
          to work from are at the bottom of the page already.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {(["Strengths", "Weaknesses", "Opportunities", "Threats"] as const).map(
          (title, i) => (
            <section
              key={title}
              className="glass-apple relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset ring-white/[0.06]"
            >
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <span className="size-1.5 animate-pulse rounded-full bg-white/30" />
                {title}
              </h3>
              <div className="mt-3 space-y-2" aria-hidden>
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-3 animate-pulse rounded bg-white/[0.06]"
                    style={{
                      width: `${70 + ((i + j) % 3) * 10}%`,
                      animationDelay: `${(i * 3 + j) * 90}ms`,
                    }}
                  />
                ))}
              </div>
            </section>
          ),
        )}
      </div>
    </>
  );
}

/**
 * The deterministic evidence, rendered from the fast half. Every bullet
 * above is required to trace back to one of these, so it is shown
 * whether or not the model ever answers.
 */
function EvidenceFooter({
  dataPoints,
}: {
  dataPoints: GeoSwot["dataPoints"];
}) {
  if (dataPoints.length === 0) return null;
  return (
    <details className="rounded-xl border border-white/[0.06] bg-white/[0.02] open:bg-white/[0.04]">
      <summary className="cursor-pointer select-none px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
        Data behind this SWOT ({dataPoints.length} data points)
      </summary>
      <ul className="space-y-1 border-t border-white/[0.06] px-4 py-3 text-[12px]">
        {dataPoints.map((dp, i) => (
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="shrink-0 font-medium text-muted-foreground">
              {dp.label}:
            </span>
            <span className="text-foreground/90">{dp.value}</span>
          </li>
        ))}
      </ul>
    </details>
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
  items,
  tone,
}: {
  title: string;
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
          (no {title.toLowerCase()} surfaced)
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
