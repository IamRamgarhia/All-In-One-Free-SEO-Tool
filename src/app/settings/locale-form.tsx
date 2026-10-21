"use client";

import { useTransition } from "react";
import { localeLabels, type Locale } from "@/i18n/config";
import { setLocalePreference } from "./locale-actions";

export function LocaleForm({
  current,
  title,
  description,
  saveLabel,
}: {
  current: Locale;
  title: string;
  description: string;
  saveLabel: string;
}) {
  const [pending, startTransition] = useTransition();

  function onChange(locale: Locale) {
    startTransition(async () => {
      await setLocalePreference(locale);
    });
  }

  return (
    <section
      id="language"
      className="relative scroll-mt-24 overflow-hidden rounded-2xl border border-white/5 bg-card/40 backdrop-blur-md"
    >
      <header className="relative border-b border-white/5 px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="relative flex flex-wrap items-center gap-2 p-5">
        {(Object.keys(localeLabels) as Locale[]).map((locale) => {
          const active = locale === current;
          return (
            <button
              key={locale}
              type="button"
              disabled={pending}
              onClick={() => onChange(locale)}
              aria-pressed={active}
              className={`rounded-md px-3 py-2 text-sm ring-1 ring-inset transition-colors disabled:opacity-60 ${
                active
                  ? "bg-violet-500/20 text-violet-200 ring-violet-500/40"
                  : "bg-white/[0.02] text-muted-foreground ring-white/10 hover:bg-white/[0.05] hover:text-foreground"
              }`}
            >
              {localeLabels[locale]}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {pending ? "…" : saveLabel}
        </span>
      </div>
    </section>
  );
}
