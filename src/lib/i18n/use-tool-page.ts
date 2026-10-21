"use client";

import { useTranslations } from "next-intl";
import { toolCatalogSlug } from "@/lib/i18n/tool-slug";

/**
 * Per-tool copy under `tools.pages.{slug}.*`, with shared `tools.common`.
 */
export function useToolPage(toolHref: string) {
  const slug = toolCatalogSlug(toolHref);
  const common = useTranslations("tools.common");
  const page = useTranslations(`tools.pages.${slug}`);
  const catalog = useTranslations("tools.catalog");

  function metaTitle(fallback?: string): string {
    if (page.has("title")) return page("title");
    const key = `${slug}.title`;
    if (catalog.has(key)) return catalog(key);
    return fallback ?? slug;
  }

  function metaDescription(fallback?: string): string {
    if (page.has("description")) return page("description");
    const key = `${slug}.description`;
    if (catalog.has(key)) return catalog(key);
    return fallback ?? "";
  }

  return { slug, common, page, catalog, metaTitle, metaDescription };
}
