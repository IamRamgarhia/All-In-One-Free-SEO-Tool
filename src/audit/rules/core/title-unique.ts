import { defineRule, pass, warn } from "@/audit/engine/define-rule";
import { registerResettable } from "@/audit/engine/rule-registry";
import { normalizeUrl } from "@/audit/crawler/link-graph";

const titleMap = new Map<string, string[]>();

function reset(): void {
  titleMap.clear();
}
registerResettable(reset);

export const titleUniqueRule = defineRule({
  id: "core-title-unique",
  category: "core",
  severity: "high",
  weight: 12,
  title: "Unique titles across crawl",
  description: "Titles should be unique site-wide",
  recommendation: 'Create unique titles per page: "Page topic | Brand".',
  requiresCrawl: true,
  check: async ({ page, crawl }) => {
    if (!crawl || crawl.pages.length < 2) {
      return pass("Single-page run — uniqueness not compared");
    }
    // Rebuild from crawl each check (idempotent).
    titleMap.clear();
    for (const p of crawl.pages) {
      if (!p.title) continue;
      const key = p.title.trim().toLowerCase();
      const list = titleMap.get(key) ?? [];
      list.push(normalizeUrl(p.finalUrl));
      titleMap.set(key, list);
    }
    const key = (page.title ?? "").trim().toLowerCase();
    if (!key) return pass("No title on this page");
    const urls = titleMap.get(key) ?? [];
    if (urls.length > 1) {
      return warn(`Duplicate title shared by ${urls.length} pages`, {
        title: page.title,
        urls,
      });
    }
    return pass("Title is unique in this crawl");
  },
});
