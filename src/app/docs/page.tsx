import Link from "next/link";
import { BookOpen, Clock } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shell/page-header";
import { GUIDE_GROUPS, guidesFor } from "@/lib/docs-guides";
import {
  TOOL_CAPABILITIES,
  capabilityOf,
  copyOf,
} from "@/lib/tool-capabilities";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  categoryOf,
  isRetired,
  type ToolCategoryId,
} from "@/lib/tool-categories";
import { ToolRow, catalogText } from "./doc-parts";

export async function generateMetadata() {
  const t = await getTranslations("docs");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Docs home: the guides, then every tool with an anchor.
 *
 * Server-rendered from the same generated capability table the app uses,
 * so a tool cannot appear here with a description or a cost badge that
 * disagrees with its own card.
 */
export default async function DocsPage() {
  const [t, tCat, tCatalog, locale] = await Promise.all([
    getTranslations("docs"),
    getTranslations("tools.categories"),
    getTranslations("tools.catalog"),
    getLocale(),
  ]);
  const guides = guidesFor(locale);

  // Every non-retired tool that has a card, grouped the way the tools
  // page groups them, so the two read the same way.
  const byCategory = new Map<ToolCategoryId, string[]>();
  for (const cap of TOOL_CAPABILITIES) {
    if (!/^\/tools\/[^/]+$/.test(cap.route)) continue;
    if (isRetired(cap.route)) continue;
    if (!copyOf(capabilityOf(cap.route))) continue;
    const cat = categoryOf(cap.route);
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), cap.route]);
  }
  const listed = [...byCategory.values()].flat();
  const documented = listed.length;
  // Counted from the very list rendered below, not from the global
  // totals. Those count retired tools and one with no card, so the
  // banner said "96" directly above a heading that said "87".
  const freeListed = listed.filter(
    (route) => capabilityOf(route)?.needsAI === false,
  ).length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={BookOpen}
        accent="violet"
        noHelp
      />

      {/* The other help pages. They each had an entry in the account menu,
          six lines for one need; the menu now has "Help" and they are here. */}
      <nav aria-label={t("more.label")} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">{t("more.label")}</span>
        {(
          [
            ["/welcome", "getStarted"],
            ["/learn", "learn"],
            ["/knowledge", "knowledge"],
            ["/seo-chat/capabilities", "chat"],
            ["/automations/overview", "automated"],
          ] as const
        ).map(([href, key]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent hover:text-foreground"
          >
            {t(`more.${key}`)}
          </Link>
        ))}
      </nav>

      {/* The one number worth leading with. */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
        <p className="text-sm leading-relaxed">
          {t.rich("freeBanner", {
            free: freeListed,
            total: documented,
            strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
            tag: (chunks) => (
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-300 ring-1 ring-inset ring-emerald-400/25">
                {chunks}
              </span>
            ),
          })}
        </p>
      </div>

      {/* ---- Guides ---- */}
      {GUIDE_GROUPS.map((group) => {
        const inGroup = guides.filter((g) => g.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-lg font-semibold tracking-tight">{t(`groups.${group}`)}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {inGroup.map((g) => (
                <Link
                  key={g.slug}
                  href={`/docs/${g.slug}`}
                  className="glass-apple lift-on-hover group rounded-2xl p-4 transition-colors"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold group-hover:text-violet-300">
                      {g.title}
                    </h3>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="size-3" />
                      {t("minutes", { count: g.minutes })}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {g.summary}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground/70">
                    {t("steps", { count: g.steps.length })}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* ---- Every tool ---- */}
      <section id="tools" className="scroll-mt-24 space-y-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {t("everyTool", { count: documented })}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("everyToolHint")}
          </p>
        </div>

        {CATEGORY_ORDER.map((cat) => {
          const routes = byCategory.get(cat);
          if (!routes || routes.length === 0) return null;
          const meta = CATEGORY_LABELS[cat];
          const label = tCat.has(`${cat}.label`) ? tCat(`${cat}.label`) : meta.label;
          const description = tCat.has(`${cat}.description`)
            ? tCat(`${cat}.description`)
            : meta.description;
          return (
            <div key={cat} id={cat} className="scroll-mt-24 space-y-2 pt-2">
              <div>
                <h3 className="text-sm font-semibold">{label}</h3>
                <p className="text-xs text-muted-foreground">
                  {description}
                </p>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {routes.map((route) => (
                  <ToolRow key={route} route={route} linkLabel={t("linkTo", { title: catalogText(tCatalog as never, `${route.replace("/tools/", "")}.title`, copyOf(capabilityOf(route))?.title ?? route) })} />
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
