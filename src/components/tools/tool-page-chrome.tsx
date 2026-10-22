"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toolCatalogSlug } from "@/lib/i18n/tool-slug";

type ToolPageChromeProps = {
  /** Path like `/tools/llms-txt` */
  toolHref: string;
  icon?: LucideIcon;
  accentRing?: string;
  accentBg?: string;
  iconClassName?: string;
  /** Override catalog title (rare) */
  title?: string;
  /** Override catalog description */
  description?: string;
  children?: ReactNode;
};

/**
 * Shared header for /tools/* pages: back link, title + description from
 * tools.catalog (grid) with optional tools.pages.{slug} overrides.
 */
export function ToolPageChrome({
  toolHref,
  icon: Icon,
  accentRing = "ring-violet-400/30",
  accentBg = "bg-violet-500/15",
  iconClassName = "text-violet-300",
  title,
  description,
  children,
}: ToolPageChromeProps) {
  const slug = toolCatalogSlug(toolHref);
  const tCommon = useTranslations("tools.common");
  const tPage = useTranslations(`tools.pages.${slug}`);
  const tCatalog = useTranslations("tools.catalog");

  const resolvedTitle =
    title ??
    (tPage.has("title") ? tPage("title") : tCatalog(`${slug}.title`));
  const resolvedDescription =
    description ??
    (tPage.has("description")
      ? tPage("description")
      : tCatalog(`${slug}.description`));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3 shrink-0" />
        {tCommon("allTools")}
      </Link>

      <header className="space-y-2">
        <div className="flex items-start gap-3">
          {Icon ? (
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${accentBg} ${accentRing}`}
            >
              <Icon className={`size-5 ${iconClassName}`} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="text-gradient-brand">{resolvedTitle}</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {resolvedDescription}
            </p>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
