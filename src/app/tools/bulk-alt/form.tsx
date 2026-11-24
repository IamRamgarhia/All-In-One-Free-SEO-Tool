"use client";

import { useActionState } from "react";
import { usePresetUrl } from "@/components/use-preset-url";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { runBulkAlt, type AltState } from "./actions";

export function BulkAltForm() {
  // Opened from a client's file: the page (or site) arrives filled in.
  const presetUrl = usePresetUrl();
  const t = useTranslations("tools.ui.bulk-alt");
  const [state, formAction, pending] = useActionState<AltState | null, FormData>(
    runBulkAlt,
    null,
  );

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
            placeholder="https://yoursite.com/post"
            className="h-9 w-full rounded-md border border-white/10 bg-card/60 px-3 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex h-9 items-center justify-center rounded-md bg-emerald-500/15 px-4 text-xs font-medium text-emerald-300 ring-1 ring-inset ring-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-50"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 size-3 animate-spin" />
                {t("generating")}
              </>
            ) : (
              <>
                <ImageIcon className="mr-2 size-3" />
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
        <section className="glass-apple relative overflow-hidden rounded-2xl">
          <header className="border-b border-white/[0.06] px-5 py-3">
            <h3 className="text-sm font-semibold">
              {t("suggestionsTitle", { count: state.suggestions.length })}
            </h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t("pageContext", { context: state.pageContext.slice(0, 120) })}
            </p>
          </header>
          <ul className="divide-y divide-white/[0.05]">
            {state.suggestions.map((s, i) => (
              <li key={i} className="grid grid-cols-[140px_1fr] gap-3 px-5 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.src}
                  alt={s.alt}
                  className="h-20 w-32 rounded object-cover ring-1 ring-inset ring-white/5"
                />
                <div className="min-w-0 space-y-1 text-xs">
                  <code className="block truncate text-[10px] text-muted-foreground">
                    {s.src}
                  </code>
                  <p className="font-medium">{s.alt}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t("chars", { count: s.alt.length })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
