"use client";

import type { ReactNode } from "react";
import { BarChart3, FileText, Search } from "lucide-react";
import type { ThemePreference } from "@/app/settings/theme-actions";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { GlobalRankLogo } from "@/components/brand/global-rank-wordmark";
import type { AuthBrandCopy } from "@/lib/auth-brand-copy";

const PANEL_ICONS = [Search, BarChart3, FileText] as const;

export function AuthBrandedLayout({
  brand,
  theme,
  children,
}: {
  brand: AuthBrandCopy;
  theme: ThemePreference;
  children: ReactNode;
}) {
  const panelItems = brand.features.slice(0, 3);

  return (
    <div className="grid h-svh max-h-svh w-full overflow-hidden bg-background lg:grid-cols-2">
      <div className="order-2 flex min-h-0 flex-col lg:order-1">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-4 sm:px-6 lg:hidden">
          <GlobalRankLogo size="sm" />
          <ThemeToggle theme={theme} />
        </header>

        <main className="relative flex min-h-0 flex-1 items-center justify-center p-5 sm:p-8 lg:p-10">
          <div className="absolute end-6 top-6 hidden lg:flex">
            <ThemeToggle theme={theme} />
          </div>
          <div className="w-full max-w-[420px] rounded-2xl border border-border/80 bg-card p-6 text-card-foreground shadow-sm sm:p-7">
            <div className="mb-6 flex justify-center lg:hidden">
              <GlobalRankLogo size="md" />
            </div>
            {children}
          </div>
        </main>
      </div>

      <aside
        aria-label={brand.appName}
        className="relative order-1 hidden min-h-0 flex-col overflow-hidden bg-[#111721] text-white lg:order-2 lg:m-5 lg:flex lg:rounded-[28px] lg:border lg:border-white/10"
      >
        <div className="flex flex-col items-center gap-5 p-8 text-center lg:px-12 lg:pt-12 lg:pb-6">
          <div className="hidden w-full shrink-0 justify-center overflow-x-auto lg:flex">
            <GlobalRankLogo inverted size="md" asSvg className="!max-w-[220px]" />
          </div>
          <div className="flex w-full max-w-md flex-col gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              {brand.kicker}
            </p>
            <h2 className="text-balance text-2xl font-semibold tracking-[-0.035em] md:text-[30px]/[1.15]">
              {brand.headlineAccent}{" "}
              <span className="font-serif font-normal italic text-white/60">
                {brand.headlineRest}
              </span>
            </h2>
            <p className="max-w-md text-sm leading-6 text-white/60">{brand.pitch}</p>
          </div>
        </div>

        <ul className="relative mt-auto hidden flex-1 flex-col justify-end gap-3 px-8 pb-8 sm:flex lg:px-12 lg:pb-12">
          {panelItems.map((item, i) => {
            const Icon = PANEL_ICONS[i] ?? Search;
            return (
              <li
                key={item.title}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-white/10">
                  <Icon className="size-4" strokeWidth={2} aria-hidden />
                </span>
                <span className="text-sm font-medium text-white/85">
                  {item.desc}
                </span>
              </li>
            );
          })}
        </ul>

        <p className="px-8 pb-8 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-white/40 lg:px-12 lg:pb-10">
          {brand.groupCredit}
        </p>
      </aside>
    </div>
  );
}
