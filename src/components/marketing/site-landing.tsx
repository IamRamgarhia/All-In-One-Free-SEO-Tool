import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ThemePreference } from "@/app/settings/theme-actions";
import { GlobalRankLogo } from "@/components/brand/global-rank-wordmark";
import { LandingHeroConsole } from "@/components/marketing/landing-hero-console";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SiteLandingCopy = {
  navFeatures: string;
  navSignIn: string;
  heroKicker: string;
  heroLine1: string;
  heroLine2: string;
  heroBody: string;
  heroPrimary: string;
  heroSecondary: string;
  heroConsoleCaption: string;
  trustLabel: string;
  pillarAuditsTitle: string;
  pillarAuditsBody: string;
  pillarRankTitle: string;
  pillarRankBody: string;
  pillarDeliverTitle: string;
  pillarDeliverBody: string;
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  footerOrg: string;
  footerPrivate: string;
};

const NAVY = "#1a2744";
const ACCENT = "#5b8fd4";

export function SiteLanding({
  copy,
  theme,
}: {
  copy: SiteLandingCopy;
  theme: ThemePreference;
}) {
  const pillars = [
    { n: "01", title: copy.pillarAuditsTitle, body: copy.pillarAuditsBody },
    { n: "02", title: copy.pillarRankTitle, body: copy.pillarRankBody },
    { n: "03", title: copy.pillarDeliverTitle, body: copy.pillarDeliverBody },
  ] as const;

  return (
    <div className="dark relative min-h-svh overflow-x-hidden bg-[#080d16] text-white selection:bg-[#5b8fd4]/30">
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.35]"
        style={{
          background: `radial-gradient(1200px 600px at 85% -10%, ${ACCENT}33, transparent 55%),
            radial-gradient(900px 500px at 10% 100%, ${NAVY}99, transparent 50%),
            linear-gradient(180deg, #080d16 0%, #0a1020 40%, #080d16 100%)`,
        }}
        aria-hidden
      />

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#080d16]/90 backdrop-blur-lg">
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between gap-6 px-5 sm:px-8">
          <Link href="/" className="shrink-0 opacity-95 transition-opacity hover:opacity-100">
            <GlobalRankLogo inverted size="md" asSvg className="!max-w-[200px]" />
          </Link>
          <nav className="hidden items-center gap-8 text-[13px] text-white/55 md:flex">
            <a href="#piliers" className="transition-colors hover:text-white">
              {copy.navFeatures}
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} />
            <Link
              href="/login"
              className={buttonVariants({
                size: "sm",
                variant: "outline",
                className:
                  "h-9 border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white sm:h-10 sm:px-5",
              })}
            >
              {copy.navSignIn}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-14 lg:pt-20">
          <div className="max-w-xl animate-page-enter">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#5b8fd4]/25 bg-[#1a2744]/40 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7eb8f0]">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              {copy.heroKicker}
            </p>
            <h1 className="mt-6 text-[2.35rem] font-bold leading-[1.06] tracking-[-0.035em] sm:text-[2.85rem] lg:text-[3.15rem]">
              {copy.heroLine1}
              <span className="mt-1 block font-serif text-[2rem] font-normal italic leading-[1.12] text-[#9ec5f0] sm:text-[2.45rem] lg:text-[2.65rem]">
                {copy.heroLine2}
              </span>
            </h1>
            <p className="mt-5 text-pretty text-[15px] leading-[1.65] text-white/58 sm:text-base">
              {copy.heroBody}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 gap-2 rounded-xl bg-[#5b8fd4] px-7 text-[15px] font-semibold text-[#061018] shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] hover:bg-[#6fa0e0]",
                )}
              >
                {copy.heroPrimary}
                <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </Link>
              <a
                href="#piliers"
                className="inline-flex h-12 items-center rounded-xl px-5 text-[14px] font-medium text-white/75 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                {copy.heroSecondary}
              </a>
            </div>
            <p className="mt-8 text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">
              {copy.trustLabel}
            </p>
          </div>

          <div className="animate-page-enter stagger-2 lg:justify-self-end">
            <LandingHeroConsole caption={copy.heroConsoleCaption} />
          </div>
        </section>

        <section
          id="piliers"
          className="border-t border-white/[0.07] bg-[#0a1020]/80 py-20 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <ul className="divide-y divide-white/[0.08]">
              {pillars.map((p) => (
                <li
                  key={p.n}
                  className="grid gap-4 py-10 first:pt-0 last:pb-0 sm:grid-cols-[4rem_1fr] sm:gap-8 lg:grid-cols-[5rem_1fr_minmax(0,28rem)] lg:items-start"
                >
                  <span className="font-mono text-sm font-semibold tabular-nums text-[#5b8fd4]">
                    {p.n}
                  </span>
                  <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    {p.title}
                  </h2>
                  <p className="text-[15px] leading-relaxed text-white/55 lg:col-start-2 lg:col-end-4 lg:mt-1 lg:max-w-2xl">
                    {p.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-[#5b8fd4]/20 bg-[#1a2744] px-6 py-12 sm:px-12 sm:py-14">
              <div
                className="pointer-events-none absolute -end-24 -top-24 size-72 rounded-full bg-[#5b8fd4]/15 blur-3xl"
                aria-hidden
              />
              <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-lg">
                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {copy.ctaTitle}
                  </h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/60">
                    {copy.ctaBody}
                  </p>
                </div>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 shrink-0 rounded-xl bg-white px-8 text-[15px] font-semibold text-[#1a2744] hover:bg-white/92",
                  )}
                >
                  {copy.ctaButton}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.07] py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 text-[12px] text-white/40 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>{copy.footerPrivate}</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">
            {copy.footerOrg}
          </p>
        </div>
      </footer>
    </div>
  );
}
