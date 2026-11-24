"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { runRefresh, type RefreshState } from "./actions";
import { AiFeedback } from "@/components/ai-feedback";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { ToolStat } from "@/components/tools/tool-stat";

export function RefreshForm() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetUrl = usePresetUrl();
  const t = useTranslations("tools.ui.refresh");
  const [state, formAction, pending] = useActionState<RefreshState | null, FormData>(
    runRefresh,
    null,
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("pageUrl")}</span>
            <input
              name="url"
              defaultValue={presetUrl}
              required
              placeholder="https://yoursite.com/blog/post"
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("targetKeyword")}</span>
            <input
              name="targetKeyword"
              required
              placeholder={t("keywordPlaceholder")}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="text-muted-foreground">{t("country")}</span>
            <input
              name="country"
              defaultValue="US"
              maxLength={4}
              className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm uppercase focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md bg-amber-500/15 px-5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/30 hover:bg-amber-500/25 disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("running")}
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 size-4" />
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
          {state.plan.error && (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-inset ring-amber-500/30">
              {state.plan.error}
            </p>
          )}

          {state.plan.corpusSize > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <ToolStat
                  label={t("wordGap")}
                  value={
                    state.plan.wordGap > 0
                      ? `+${state.plan.wordGap}`
                      : `${state.plan.wordGap}`
                  }
                  hint={t("serpMedian", { count: state.plan.serpMedianWordCount })}
                  tone={state.plan.wordGap > 200 ? "rose" : state.plan.wordGap > 0 ? "amber" : "emerald"}
                />
                <ToolStat
                  label={t("missingTopics")}
                  value={String(state.plan.missingTerms.length)}
                  hint={t("missingTopicsHint")}
                  tone={state.plan.missingTerms.length > 10 ? "rose" : "amber"}
                />
                <ToolStat
                  label={t("missingSections")}
                  value={String(state.plan.missingSections.length)}
                  hint={t("missingSectionsHint")}
                  tone={state.plan.missingSections.length > 3 ? "rose" : "amber"}
                />
              </div>

              {state.plan.brief && (
                <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold">{t("planTitle")}</h2>
                    <AiFeedback
                      feature="content_idea"
                      aiOutput={state.plan.brief}
                      size="sm"
                    />
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {state.plan.brief}
                  </pre>
                  <AiDisclaimer />
                </section>
              )}

              {state.plan.missingTerms.length > 0 && (
                <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
                  <h3 className="text-sm font-semibold">
                    {t("missingTopicsTitle")}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {state.plan.missingTerms.map((term) => (
                      <span
                        key={term}
                        className="rounded-md bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200 ring-1 ring-inset ring-rose-500/30"
                      >
                        {term}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {state.plan.missingSections.length > 0 && (
                <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
                  <h3 className="text-sm font-semibold">{t("sectionsTitle")}</h3>
                  <ul className="space-y-1 text-sm">
                    {state.plan.missingSections.map((s) => (
                      <li key={s} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-400" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
