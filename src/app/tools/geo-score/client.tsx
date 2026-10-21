"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { useRunRefreshKey } from "@/components/use-run-refresh-key";
import { Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { runGeoScore, type GeoScoreState } from "./actions";
import { RecentRuns } from "@/components/recent-runs";

const CATEGORY_KEYS = [
  "citability",
  "technical",
  "schema",
  "content",
  "platform",
] as const;

export function GeoScoreClient({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const presetUrl = usePresetUrl();
  const t = useTranslations("tools.geoScore");
  const tCommon = useTranslations("tools.common");
  const [state, formAction, pending] = useActionState<GeoScoreState, FormData>(
    runGeoScore,
    null,
  );
  const refreshKey = useRunRefreshKey(state?.ok ? state : null);

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl space-y-3 p-5"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_200px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{tCommon("urlLabel")}</span>
            <input
              name="url"
              defaultValue={presetUrl}
              required
              placeholder="https://yoursite.com/page"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
            />
          </label>
          {clients.length > 0 && (
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">{t("clientOptional")}</span>
              <select
                name="clientId"
                className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm"
              >
                <option value="">{t("clientNone")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-violet-500/15 px-5 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("running")}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              {t("submit")}
            </>
          )}
        </button>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <section
            className={`rounded-2xl border p-6 ${
              state.composite >= 75
                ? "border-emerald-500/30 bg-emerald-500/5"
                : state.composite >= 50
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-rose-500/30 bg-rose-500/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{state.url}</h2>
              <div
                className={`text-4xl font-bold tabular-nums ${
                  state.composite >= 75
                    ? "text-emerald-300"
                    : state.composite >= 50
                      ? "text-amber-300"
                      : "text-rose-300"
                }`}
              >
                {state.composite}
                <span className="text-base text-muted-foreground">/100</span>
              </div>
            </div>
            <p className="mt-2 text-sm">{state.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("tierLine", { tier: state.tier })} · {state.tierMeaning}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("findingsCount", { count: state.findingCount })}
            </p>
          </section>

          <section className="space-y-2">
            {CATEGORY_KEYS.map((key) => {
              const d = state.categories[key];
              if (!d) return null;
              return (
                <div
                  key={key}
                  className={`rounded-xl border px-4 py-3 ${
                    d.score >= 75
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : d.score >= 50
                        ? "border-amber-500/20 bg-amber-500/[0.04]"
                        : "border-rose-500/20 bg-rose-500/[0.04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <p className="font-medium">
                        {t(`categories.${key}` as "categories.citability")}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {t("weightPct", { pct: d.weightPct })}
                      </p>
                    </div>
                    <span
                      className={`text-2xl font-bold tabular-nums ${
                        d.score >= 75
                          ? "text-emerald-300"
                          : d.score >= 50
                            ? "text-amber-300"
                            : "text-rose-300"
                      }`}
                    >
                      {d.score}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`h-full ${
                        d.score >= 75
                          ? "bg-emerald-400/70"
                          : d.score >= 50
                            ? "bg-amber-400/70"
                            : "bg-rose-400/70"
                      }`}
                      style={{ width: `${d.score}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{d.note}</p>
                </div>
              );
            })}
          </section>
        </>
      )}

      <RecentRuns toolId="geo-score" refreshKey={refreshKey} />
    </div>
  );
}
