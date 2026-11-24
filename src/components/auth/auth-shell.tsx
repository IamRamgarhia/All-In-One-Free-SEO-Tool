import { getLocale, getTranslations } from "next-intl/server";
import { FileSearch, PenLine, Send } from "lucide-react";
import { isLocale } from "@/i18n/config";
import { loadBrand } from "@/lib/brand";
import { BRAND_GRADIENT, INK, PRODUCT_NAME, ProductLogo } from "@/components/brand/product-logo";
import { LocaleToggle } from "@/components/locale-toggle";
import { AuthThemeToggle } from "./auth-theme-toggle";

/**
 * The frame every sign-in screen renders in: login, first-run owner
 * setup and invited signup.
 *
 * It replaces the app shell on those routes (see the root layout). It
 * carries the product's logo, `<rank_forge/>`, like the landing page,
 * and the tagline from Settings → Branding when one is set. A visitor
 * who is not signed in can still switch language and light / dark here.
 */

export async function AuthShell({ children }: { children: React.ReactNode }) {
  const [t, brand, rawLocale] = await Promise.all([
    getTranslations("auth.shell"),
    loadBrand().catch(() => null),
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : "fr";
  const tagline = brand?.tagline?.trim() || t("tagline");
  const year = new Date().getFullYear();

  const pillars = [
    { icon: FileSearch, title: t("auditTitle"), body: t("auditBody") },
    { icon: PenLine, title: t("writeTitle"), body: t("writeBody") },
    { icon: Send, title: t("publishTitle"), body: t("publishBody") },
  ];

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside
        className="relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between"
        style={{
          background: `radial-gradient(120% 90% at 0% 0%, ${BRAND_GRADIENT[0]} 0%, ${BRAND_GRADIENT[0]}aa 30%, ${INK} 78%)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-24 size-[28rem] rounded-full opacity-30 blur-3xl"
          style={{ background: BRAND_GRADIENT[1] }}
        />
        <a href="/accueil" className="relative w-fit">
          <ProductLogo wordmarkClassName="text-[22px]" />
        </a>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">
              {t("headline")}
            </h2>
            <p className="text-sm leading-relaxed text-white/75">{tagline}</p>
          </div>
          <ul className="space-y-4">
            {pillars.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/20">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs leading-relaxed text-white/65">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {year} {PRODUCT_NAME}
        </p>
      </aside>

      <main className="flex min-h-dvh flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <a href="/accueil" className="lg:invisible">
            <ProductLogo tone="auto" wordmarkClassName="text-[16px]" />
          </a>
          <div className="flex items-center gap-2">
            <AuthThemeToggle lightLabel={t("themeLight")} darkLabel={t("themeDark")} />
            <LocaleToggle current={locale} tone="auto" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-[11px] text-muted-foreground lg:hidden">
          © {year} {PRODUCT_NAME}
        </p>
      </main>
    </div>
  );
}
