export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  FileSearch,
  FileText,
  Mail,
  MessageSquareText,
  PenLine,
  Phone,
  Receipt,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { isLocale } from "@/i18n/config";
import { loadBrand, type Brand } from "@/lib/brand";
import { BRAND_GRADIENT, PRODUCT_NAME, ProductLogo, ProductWordmark } from "@/components/brand/product-logo";
import { LocaleToggle } from "@/components/locale-toggle";

/**
 * The public landing page: what a signed-out visitor sees at the root of
 * the instance, before the sign-in screen.
 *
 * It carries the product's own name and logo (PRODUCT_NAME). The brand
 * colour, tagline and contact details still come from Settings →
 * Branding. Middleware sends a signed-out `/`
 * here and forwards `x-embed`, so the app shell is never rendered under
 * it and none of the agency's navigation reaches a stranger.
 */

async function brandOrNull(): Promise<Brand | null> {
  return loadBrand().catch(() => null);
}

export async function generateMetadata(): Promise<Metadata> {
  const [brand, t] = await Promise.all([brandOrNull(), getTranslations("landing")]);
  const name = PRODUCT_NAME;
  return {
    title: t("metaTitle", { name }),
    description: brand?.tagline?.trim() || t("metaDescription"),
  };
}

export default async function LandingPage() {
  const [brand, t, rawLocale] = await Promise.all([
    brandOrNull(),
    getTranslations("landing"),
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : "fr";
  const name = PRODUCT_NAME;
  // The product's blue, not Settings → Branding: the page carries the
  // product's own logo, and another brand colour would clash with it.
  const accent = BRAND_GRADIENT[1];
  const tagline = brand?.tagline?.trim() || null;
  const email = brand?.email?.trim() || null;
  const phone = brand?.phone?.trim() || null;
  const website = brand?.website?.trim() || null;
  const onAccent = readableOn(accent);
  const year = new Date().getFullYear();

  const services: { icon: LucideIcon; key: string }[] = [
    { icon: FileSearch, key: "audit" },
    { icon: BarChart3, key: "rank" },
    { icon: PenLine, key: "content" },
    { icon: Send, key: "publish" },
    { icon: Receipt, key: "quote" },
    { icon: UserRound, key: "portal" },
  ];
  const steps = ["one", "two", "three", "four"];
  const stats = ["rules", "tools", "languages", "brand"];
  const portalPoints = ["reports", "quotes", "content", "assistant"];

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto motion-safe:scroll-smooth bg-white text-slate-900"
      style={{ "--brand": accent } as CSSProperties}
    >
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-[#070912] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full opacity-40 blur-[120px]"
          style={{ background: accent }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-56 right-[-10rem] size-[32rem] rounded-full bg-cyan-400 opacity-20 blur-[120px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 50% 0%, black 30%, transparent 75%)",
          }}
        />

        <header className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
          <Link href="/accueil" className="min-w-0 text-white">
            <ProductLogo wordmarkClassName="text-[16px] sm:text-[19px]" />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-white/70 md:flex">
            <a href="#services" className="hover:text-white">{t("navServices")}</a>
            <a href="#methode" className="hover:text-white">{t("navMethod")}</a>
            <a href="#espace-client" className="hover:text-white">{t("navPortal")}</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <LocaleToggle current={locale} />
            </div>
            {/* A plain <a>, not <Link>: the root layout picks the sign-in
                frame on a full load only, so a client-side hop to /login
                would render the form inside this page's frame, unstyled. */}
            <a
              href="/login"
              className="whitespace-nowrap rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white/90 sm:px-4"
            >
              {t("navSignIn")}
            </a>
          </div>
        </header>

        <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
              <Sparkles className="size-3.5" style={{ color: accent }} />
              {t("heroKicker")}
            </p>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              {t("heroTitleStart")}{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: `linear-gradient(90deg, ${BRAND_GRADIENT[0]}, ${BRAND_GRADIENT[1]} 55%, ${BRAND_GRADIENT[2]})` }}
              >
                {t("heroTitleAccent")}
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-white/65 sm:text-lg">
              {t("heroBody", { name })}
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="/login"
                className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold shadow-lg transition hover:brightness-110"
                style={{ background: accent, color: onAccent, boxShadow: `0 12px 32px -12px ${accent}` }}
              >
                {t("heroPrimary")}
                <ArrowRight className="size-4" />
              </a>
              <a
                href="#services"
                className="inline-flex h-12 items-center rounded-xl border border-white/15 px-6 text-[15px] font-medium text-white/85 transition hover:bg-white/5"
              >
                {t("heroSecondary")}
              </a>
            </div>
            <p className="mt-8 flex items-center gap-2 text-xs text-white/45">
              <ShieldCheck className="size-4" />
              {t("heroTrust")}
            </p>
          </div>

          <AuditPreview t={t} accent={accent} />
        </section>
      </div>

      {/* ── Stats ────────────────────────────────────────────────────── */}
      <section className="border-b border-slate-200 bg-white">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-8 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s} className="flex flex-col text-center md:border-l md:border-slate-200 md:first:border-l-0">
              <dt className="order-2 mt-1 text-sm text-slate-500">{t(`stats.${s}.label`)}</dt>
              <dd className="text-3xl font-semibold tracking-tight text-slate-900">
                {t(`stats.${s}.value`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Services ─────────────────────────────────────────────────── */}
      <section id="services" className="scroll-mt-4 bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <SectionHeading
            accent={accent}
            eyebrow={t("servicesEyebrow")}
            title={t("servicesTitle")}
            body={t("servicesBody")}
          />
          <ul className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {services.map(({ icon: Icon, key }) => (
              <li
                key={key}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(15,23,42,0.25)]"
              >
                <span
                  className="grid size-11 place-items-center rounded-xl"
                  style={{ background: `${accent}14`, color: accent }}
                >
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {t(`services.${key}.title`)}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                  {t(`services.${key}.body`)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Method ───────────────────────────────────────────────────── */}
      <section id="methode" className="scroll-mt-4 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <SectionHeading
            accent={accent}
            eyebrow={t("methodEyebrow")}
            title={t("methodTitle")}
            body={t("methodBody")}
          />
          <ol className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s} className="relative rounded-2xl border border-slate-200 p-6">
                <span
                  className="font-mono text-sm font-semibold tabular-nums"
                  style={{ color: accent }}
                >
                  0{i + 1}
                </span>
                <h3 className="mt-3 text-lg font-semibold tracking-tight">
                  {t(`steps.${s}.title`)}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                  {t(`steps.${s}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Client space + AI visibility ─────────────────────────────── */}
      <section id="espace-client" className="scroll-mt-4 bg-slate-50 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-8 lg:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 sm:p-10">
            <p className="text-sm font-semibold" style={{ color: accent }}>
              {t("portalEyebrow")}
            </p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight">
              {t("portalTitle")}
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
              {t("portalBody")}
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {portalPoints.map((p) => (
                <li key={p} className="flex gap-3 text-[15px] text-slate-700">
                  <span
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full"
                    style={{ background: accent, color: onAccent }}
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {t(`portalPoints.${p}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-[#070912] p-8 text-white sm:p-10">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full opacity-40 blur-3xl"
              style={{ background: accent }}
            />
            <Bot className="relative size-8" style={{ color: accent }} />
            <h2 className="relative mt-5 text-balance text-2xl font-semibold tracking-tight">
              {t("aiTitle")}
            </h2>
            <p className="relative mt-4 text-[15px] leading-relaxed text-white/65">
              {t("aiBody")}
            </p>
            <div className="relative mt-8 flex flex-wrap gap-2">
              {["ChatGPT", "Perplexity", "Gemini", "Google AI Overviews"].map((engine) => (
                <span
                  key={engine}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80"
                >
                  {engine}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Final call to action ─────────────────────────────────────── */}
      <section className="bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-8">
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-14 text-center text-white sm:px-12"
            style={{ background: `linear-gradient(135deg, ${BRAND_GRADIENT[0]} 0%, #06283d 45%, #0b0d14 90%)` }}
          >
            <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("ctaTitle")}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-[15px] leading-relaxed text-white/75 sm:text-base">
              {t("ctaBody")}
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <a
                href="/login"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-semibold text-slate-900 transition hover:bg-white/90"
              >
                {t("ctaPrimary")}
                <ArrowRight className="size-4" />
              </a>
              {email && (
                <a
                  href={`mailto:${email}?subject=${encodeURIComponent(t("ctaMailSubject"))}`}
                  className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/30 px-6 text-[15px] font-medium text-white transition hover:bg-white/10"
                >
                  <Mail className="size-4" />
                  {t("ctaContact")}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div>
            <ProductWordmark tone="light" className="text-base" />
            <p className="mt-1">{tagline ?? t("footerTagline")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {email && (
              <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 hover:text-slate-900">
                <Mail className="size-4" />
                {email}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-slate-900">
                <Phone className="size-4" />
                {phone}
              </a>
            )}
            {website && /^https?:\/\//i.test(website) && (
              <a href={website} rel="noopener" className="hover:text-slate-900">
                {website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
              </a>
            )}
            <span>
              © {year} {name}
            </span>
            <div className="rounded-full bg-[#070912] sm:hidden">
              <LocaleToggle current={locale} />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * Text colour for content drawn on the accent colour: whichever of ink
 * or white contrasts more. Around 0.18 relative luminance both give the
 * same WCAG contrast ratio, so that is the switch point.
 */
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? "#0b0d14" : "#ffffff";
}

type T = Awaited<ReturnType<typeof getTranslations<"landing">>>;

function SectionHeading({
  accent,
  eyebrow,
  title,
  body,
}: {
  accent: string;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold" style={{ color: accent }}>
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 text-pretty text-base leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}

/**
 * A drawn preview of an audit result. Illustrative only: no client data
 * is ever shown on this page.
 */
function AuditPreview({ t, accent }: { t: T; accent: string }) {
  const score = 86;
  const circumference = 2 * Math.PI * 42;
  const bars = [
    { key: "technical", value: 92 },
    { key: "content", value: 78 },
    { key: "performance", value: 85 },
    { key: "ai", value: 64 },
  ];
  const issues = [
    { key: "critical", count: 3, color: "#f43f5e" },
    { key: "warning", count: 12, color: "#f59e0b" },
    { key: "notice", count: 41, color: "#38bdf8" },
  ];

  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-2 shadow-2xl backdrop-blur">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#0c1020] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-white/40">{t("preview.label")}</p>
              <p className="mt-1 font-medium text-white/90">{t("preview.site")}</p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              {t("preview.done")}
            </span>
          </div>

          <div className="mt-6 flex items-center gap-6">
            <div className="relative size-28 shrink-0">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={accent}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - score / 100)}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                  <p className="text-3xl font-semibold leading-none">{score}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-white/45">{t("preview.score")}</p>
                </div>
              </div>
            </div>
            <ul className="w-full space-y-3">
              {bars.map((b) => (
                <li key={b.key}>
                  <div className="flex justify-between text-xs text-white/60">
                    <span>{t(`preview.bars.${b.key}`)}</span>
                    <span className="tabular-nums text-white/80">{b.value}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full" style={{ width: `${b.value}%`, background: accent }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <ul className="mt-6 grid grid-cols-3 gap-2">
            {issues.map((i) => (
              <li key={i.key} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <p className="text-lg font-semibold tabular-nums" style={{ color: i.color }}>
                  {i.count}
                </p>
                <p className="text-[11px] text-white/50">{t(`preview.issues.${i.key}`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-4 hidden items-center gap-3 rounded-2xl border border-white/10 bg-[#111629] px-4 py-3 shadow-xl sm:flex">
        <span className="grid size-9 place-items-center rounded-lg bg-white/5" style={{ color: accent }}>
          <FileText className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-white">{t("preview.planTitle")}</p>
          <p className="text-xs text-white/50">{t("preview.planBody")}</p>
        </div>
      </div>
      <div className="absolute -right-3 -top-5 hidden items-center gap-2 rounded-full border border-white/10 bg-[#111629] px-3 py-2 text-xs text-white/80 shadow-xl sm:flex">
        <MessageSquareText className="size-3.5" style={{ color: accent }} />
        {t("preview.chip")}
      </div>
    </div>
  );
}
