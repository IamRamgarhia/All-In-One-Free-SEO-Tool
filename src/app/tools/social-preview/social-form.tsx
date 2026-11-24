"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { Loader2, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { runSocial, type SocialState } from "./actions";

export function SocialForm() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetUrl = usePresetUrl();
  const t = useTranslations("tools.ui.social-preview");
  const [state, formAction, pending] = useActionState<
    SocialState | null,
    FormData
  >(runSocial, null);

  return (
    <>
      <form
        action={formAction}
        className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-3"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_140px]">
          <input
            name="url"
            defaultValue={presetUrl}
            required
            placeholder="https://yoursite.com/blog/post"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-cyan-500/15 px-4 text-xs font-medium text-cyan-300 ring-1 ring-inset ring-cyan-500/30 hover:bg-cyan-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                {t("fetching")}
              </>
            ) : (
              <>
                <Share2 className="mr-2 size-3" />
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
          {state.result.warnings.length > 0 && (
            <section className="glass-apple relative overflow-hidden rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-semibold">{t("warnings")}</h3>
              <ul className="space-y-1 text-xs">
                {state.result.warnings.map((w, i) => (
                  <li
                    key={i}
                    className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-300 ring-1 ring-inset ring-amber-500/30"
                  >
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Facebook / LinkedIn / Slack preview */}
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">Facebook · LinkedIn · Slack</h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Open Graph</p>
              </header>
              <div className="overflow-hidden bg-white">
                {state.result.og.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={state.result.og.image}
                    alt="og:image"
                    className="aspect-[1.91/1] w-full object-cover bg-neutral-200"
                  />
                ) : (
                  <div className="aspect-[1.91/1] w-full bg-neutral-200 grid place-items-center text-xs text-neutral-500">
                    {t("noOgImage")}
                  </div>
                )}
                <div className="space-y-1 p-3 text-neutral-900">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                    {(state.result.og.siteName ?? new URL(state.result.url).hostname).toUpperCase()}
                  </p>
                  <p className="line-clamp-2 text-sm font-semibold">
                    {state.result.og.title ?? t("noOgTitle")}
                  </p>
                  <p className="line-clamp-2 text-xs text-neutral-600">
                    {state.result.og.description ?? t("noOgDescription")}
                  </p>
                </div>
              </div>
            </section>

            {/* Twitter / X preview */}
            <section className="glass-apple relative overflow-hidden rounded-2xl">
              <header className="border-b border-white/[0.06] px-5 py-3">
                <h3 className="text-sm font-semibold">X / Twitter</h3>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {t("cardType", {
                    type: state.result.twitter.card ?? t("defaultSummary"),
                  })}
                </p>
              </header>
              <div className="overflow-hidden rounded-lg bg-black/30 ring-1 ring-inset ring-white/5 m-3">
                {state.result.twitter.image || state.result.og.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={state.result.twitter.image ?? state.result.og.image ?? ""}
                    alt="twitter:image"
                    className="aspect-[1.91/1] w-full object-cover"
                  />
                ) : (
                  <div className="aspect-[1.91/1] w-full bg-neutral-800 grid place-items-center text-xs text-neutral-500">
                    {t("noTwitterImage")}
                  </div>
                )}
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold">
                    {state.result.twitter.title ?? state.result.og.title ?? t("noTitle")}
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {state.result.twitter.description ??
                      state.result.og.description ??
                      t("noDescription")}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new URL(state.result.url).hostname}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <section className="glass-apple relative overflow-hidden rounded-2xl p-5">
            <h3 className="mb-3 text-sm font-semibold">{t("rawTags")}</h3>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">og:</div>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(state.result.og).map(([k, v]) => (
                    <li key={k} className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="text-muted-foreground">{k}</span>
                      <code className="break-all">{v ?? "—"}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">twitter:</div>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(state.result.twitter).map(([k, v]) => (
                    <li key={k} className="grid grid-cols-[80px_1fr] gap-2">
                      <span className="text-muted-foreground">{k}</span>
                      <code className="break-all">{v ?? "—"}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
