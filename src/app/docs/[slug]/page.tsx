import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  ExternalLink,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { navItemMessageKey } from "@/i18n/nav";
import { guideBySlug, guidesFor } from "@/lib/docs-guides";
import { CostBadge, Note, Steps, catalogText, routeLabel } from "../doc-parts";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [t, locale] = await Promise.all([getTranslations("docs"), getLocale()]);
  const guide = guideBySlug((await params).slug, locale);
  if (!guide) return { title: t("notFound") };
  return { title: t("guideMetaTitle", { title: guide.title }), description: guide.summary };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [t, tNav, tCatalog, locale] = await Promise.all([
    getTranslations("docs"),
    getTranslations("nav.items"),
    getTranslations("tools.catalog"),
    getLocale(),
  ]);
  const guide = guideBySlug((await params).slug, locale);
  if (!guide) notFound();

  const guides = guidesFor(locale);
  const index = guides.findIndex((g) => g.slug === guide.slug);
  const next = guides[index + 1] ?? null;
  // The sidebar's own name for a page, so the docs and the navigation agree.
  const label = (href: string) => {
    const key = navItemMessageKey(href);
    if (tNav.has(key)) return tNav(key);
    // A tool takes its card's name in the reader's language.
    const slug = href.replace(/^\/tools\//, "").replace(/\//g, "__");
    return href.startsWith("/tools/")
      ? catalogText(tCatalog as never, `${slug}.title`, routeLabel(href))
      : routeLabel(href);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/docs"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {t("allDocs")}
      </Link>

      <PageHeader
        title={guide.title}
        description={guide.summary}
        icon={BookOpen}
        accent="violet"
      />

      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        {t("duration", { minutes: guide.minutes, steps: guide.steps.length })}
      </p>

      <div className="glass-apple rounded-2xl p-5">
        <Steps steps={guide.steps} />
      </div>

      {guide.note && <Note>{guide.note}</Note>}

      {/* Official docs, listed rather than left to be searched for — the
          setup steps above are ours, but the apps being connected have
          their own, and hunting for the right page is most of the work. */}
      {guide.links && guide.links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("officialDocs")}</h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {guide.links.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-[13px] transition-colors hover:border-white/15"
                >
                  <span className="min-w-0 flex-1 truncate">{l.label}</span>
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tools this guide actually uses, with their real cost badge. */}
      {guide.related && guide.related.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{t("whatThisUses")}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {guide.related.map((href) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-sm transition-colors hover:border-white/15"
                >
                  <span className="truncate">{label(href)}</span>
                  <span className="ml-auto">
                    <CostBadge href={href} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {next && (
        <Link
          href={`/docs/${next.slug}`}
          className="glass-apple lift-on-hover group flex items-center gap-3 rounded-2xl p-4"
        >
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t("next")}
            </p>
            <p className="truncate text-sm font-medium group-hover:text-violet-300">
              {next.title}
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}
