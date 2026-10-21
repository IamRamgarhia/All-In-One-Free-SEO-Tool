import { Sparkles } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  citability: "Citability",
  technical: "Technical",
  schema: "Schema.org",
  content: "Content",
  platform: "Platform",
};

type GeoEnvelope = {
  scores?: {
    composite?: number;
    tier?: string;
    tier_meaning?: string;
    categories?: Record<string, number>;
  };
};

export function GeoAuditPanel({
  geoScore,
  envelope,
}: {
  geoScore: number | null | undefined;
  envelope: GeoEnvelope | null | undefined;
}) {
  const categories = envelope?.scores?.categories;
  const composite = geoScore ?? envelope?.scores?.composite;
  if (composite == null && !categories) return null;

  const entries = categories
    ? Object.entries(categories).sort(([, a], [, b]) => a - b)
    : [];

  const tone = (score: number) =>
    score >= 70 ? "text-emerald-300" : score >= 55 ? "text-amber-300" : "text-rose-300";

  return (
    <section className="rounded-2xl border border-violet-500/25 bg-gradient-to-br from-violet-500/10 via-card/40 to-card/40 px-5 py-4 backdrop-blur-md">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30">
          <Sparkles className="size-5 text-violet-200" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold tracking-tight">
            GEO readiness (native audit)
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Generative-engine scoring — citability, crawl access, structured data,
            content signals, and platform plumbing (geo-audit v1.2.1).
          </p>
          {composite != null ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-1.5">
                Composite{" "}
                <span className={`font-semibold tabular-nums ${tone(composite)}`}>
                  {composite}/100
                </span>
              </div>
              {envelope?.scores?.tier ? (
                <span className="text-xs capitalize text-muted-foreground">
                  Tier: {envelope.scores.tier}
                </span>
              ) : null}
            </div>
          ) : null}
          {envelope?.scores?.tier_meaning ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {envelope.scores.tier_meaning}
            </p>
          ) : null}
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([key, score]) => (
            <div
              key={key}
              className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[11px] font-medium tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[key] ?? key}
                </span>
                <span className={`text-lg font-semibold tabular-nums ${tone(score)}`}>
                  {score}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
