"use client";

import { useActionState } from "react";
import { Search, Sparkles, Globe, Video, MessagesSquare, BookOpen } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Term } from "@/components/ui/term";
import { researchAction, trackKeyword, type ResearchActionResult } from "./actions";
import { CountrySelect } from "@/components/country-select";

const sourceMeta = [
  { value: "google", icon: Globe },
  { value: "youtube", icon: Video },
  { value: "reddit", icon: MessagesSquare },
  { value: "wikipedia", icon: BookOpen },
] as const;

const intentTone: Record<string, string> = {
  informational: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/30",
  commercial: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  transactional: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  navigational: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

export function ResearchForm({
  clients,
}: {
  clients: { id: number; name: string }[];
}) {
  const t = useTranslations("keywords.research");
  const [state, formAction, pending] = useActionState<
    ResearchActionResult | null,
    FormData
  >(researchAction, null);

  const [source, setSource] = useState<
    "google" | "youtube" | "reddit" | "wikipedia"
  >("google");

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        className="rounded-2xl border border-white/5 bg-card/40 p-5 backdrop-blur-md"
      >
        <input type="hidden" name="source" value={source} />
        <div className="mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-card/60 p-1">
          {sourceMeta.map((s) => {
            const Icon = s.icon;
            const active = source === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSource(s.value)}
                className={
                  active
                    ? "inline-flex items-center gap-1.5 rounded-md bg-violet-500/15 px-2.5 py-1 text-xs font-medium text-violet-300 ring-1 ring-inset ring-violet-500/30"
                    : "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }
                title={t(`sourceHints.${s.value}`)}
              >
                <Icon className="size-3" />
                {t(`sources.${s.value}`)}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="seed">{t("seed")}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="seed"
                name="seed"
                placeholder={t("seedPlaceholder")}
                className="pl-9"
                required
                minLength={2}
                maxLength={100}
                defaultValue={state?.ok ? state.seed : ""}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">{t("country")}</Label>
            <CountrySelect
              defaultValue={state?.ok ? state.country : "US"}
              className="flex h-9 w-44 rounded-md border border-white/10 bg-card/60 px-3 py-1 text-sm shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mode">{t("expansion")}</Label>
            <select
              id="mode"
              name="mode"
              defaultValue="none"
              className="flex h-9 w-32 rounded-md border border-white/10 bg-card/60 px-2 text-xs shadow-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="none">{t("justSeed")}</option>
              <option value="alphabet">{t("alphabet")}</option>
              <option value="lsi">{t("lsi")}</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="shadow-lg shadow-violet-500/25 ring-1 ring-inset ring-white/15"
          >
            {pending ? t("researching") : t("submit")}
          </Button>
        </div>
      </form>

      {state && !state.ok && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {state.error}
        </div>
      )}

      {state?.ok && state.suggestions.length === 0 && (
        <div className="rounded-2xl border border-white/5 bg-card/40 px-6 py-12 text-center text-sm text-muted-foreground backdrop-blur-md">
          {t("noSuggestions", { seed: state.seed })}
        </div>
      )}

      {state?.ok && state.suggestions.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md">
          <div className="pointer-events-none absolute -left-12 -top-12 size-40 rounded-full bg-cyan-500/15 blur-3xl" />
          <header className="relative flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Sparkles className="size-4 text-cyan-300" />
                {t("suggestionsTitle", {
                  count: state.suggestions.length,
                  seed: state.seed,
                })}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("fromSource", {
                  source: state.source,
                  country: state.country,
                })}
                {state.volumeSource === "bing" && (
                  <>
                    {" · "}
                    <span
                      title={t("volumesFromBingTitle")}
                      className="cursor-help underline decoration-dotted underline-offset-2"
                    >
                      {t("volumesFromBing")}
                    </span>
                  </>
                )}
              </p>
            </div>
          </header>
          <ul className="relative max-h-[480px] divide-y divide-white/5 overflow-y-auto">
            {state.suggestions.map((s) => (
              <li
                key={s.query}
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm transition-colors hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-medium">{s.query}</span>
                  {s.bingVolume !== undefined && (
                    <span
                      title={t("bingVolumeTitle", {
                        volume: s.bingVolume.toLocaleString(),
                      })}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-emerald-300 ring-1 ring-inset ring-emerald-500/25"
                    >
                      {s.bingVolume.toLocaleString()}
                      <span className="opacity-70">{t("perMonthOnBing")}</span>
                    </span>
                  )}
                  <Term term={s.intent}>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${intentTone[s.intent]} no-underline`}
                    >
                      {s.intent}
                    </span>
                  </Term>
                  {s.isLongTail && (
                    <Term term="long-tail">
                      <span className="inline-flex shrink-0 items-center rounded-full bg-white/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-white/10 no-underline">
                        long-tail
                      </span>
                    </Term>
                  )}
                </div>
                {clients.length > 0 ? (
                  <form
                    action={trackKeyword}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="query" value={s.query} />
                    <input type="hidden" name="country" value={state.country} />
                    <input type="hidden" name="device" value="desktop" />
                    <select
                      name="clientId"
                      defaultValue={clients[0].id}
                      className="h-7 rounded-md border border-white/10 bg-card/60 px-2 text-xs"
                    >
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      {t("track")}
                    </Button>
                  </form>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("addClientToTrack")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
