"use client";

import { useActionState } from "react";
import { usePresetSite } from "@/components/use-preset-url";
import { Loader2, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { runSoft404, type SoftState } from "./actions";
import { ClientIdField } from "@/components/client-id-field";
import { ToolStat } from "@/components/tools/tool-stat";

const REASON_TONE: Record<string, string> = {
  "thin-content": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  "404-text-pattern": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "404-title-pattern": "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  "no-h1-thin": "bg-amber-500/15 text-amber-300 ring-amber-500/30",
};

export function Soft404Form() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetSite = usePresetSite();
  const t = useTranslations("tools.ui.soft-404");
  const [state, formAction, pending] = useActionState<SoftState | null, FormData>(
    runSoft404,
    null,
  );

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <ClientIdField />
        <div className="grid gap-3 md:grid-cols-[1fr_120px_140px]">
          <input
            name="startUrl"
            defaultValue={presetSite}
            required
            placeholder="https://yoursite.com"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <input
            type="number"
            name="maxPages"
            defaultValue={100}
            min={20}
            max={300}
            aria-label={t("maxPagesLabel")}
            title={t("maxPagesLabel")}
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-rose-500/15 px-4 text-xs font-medium text-rose-300 ring-1 ring-inset ring-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                {t("crawling")}
              </>
            ) : (
              <>
                <Unlink className="mr-2 size-3" />
                {t("submit")}
              </>
            )}
          </button>
        </div>
      </form>

      {state && !state.ok && (
        <p className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-300 ring-1 ring-inset ring-rose-500/30">
          {state.error}
        </p>
      )}

      {state?.ok && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <ToolStat label={t("statCrawled")} value={state.result.pagesChecked.toString()} />
            <ToolStat
              label={t("statCandidates")}
              value={state.result.flagged.length.toString()}
              tone={state.result.flagged.length > 0 ? "rose" : "emerald"}
            />
            <ToolStat
              label={t("statStatus")}
              value={
                state.result.flagged.length === 0 ? t("healthy") : t("needsReview")
              }
              tone={state.result.flagged.length === 0 ? "emerald" : "amber"}
            />
          </div>

          {state.result.flagged.length === 0 ? (
            <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
              {t("noCandidates", { count: state.result.pagesChecked })}
            </p>
          ) : (
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">
                  {t("flagged", { count: state.result.flagged.length })}
                </h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("fixOrder")}
                </p>
              </header>
              <ul className="divide-y divide-white/[0.05]">
                {state.result.flagged.map((f) => (
                  <li key={f.url} className="px-5 py-3 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ring-1 ring-inset ${REASON_TONE[f.reason]}`}
                      >
                        {t.has(`reasons.${f.reason}`)
                          ? t(`reasons.${f.reason}`)
                          : f.reason.replace(/-/g, " ")}
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {t("words", { count: f.wordCount })}
                      </span>
                    </div>
                    <code className="block truncate">{f.url}</code>
                    <p className="text-muted-foreground">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
