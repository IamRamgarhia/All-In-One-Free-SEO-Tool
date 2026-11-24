import { DOCUMENT_TITLE } from "@/audit/rules/document-title";
import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import { registerResettable } from "@/audit/engine/rule-registry";

export const titleRegistry = /* @__PURE__ */ new Map();
export function resetTitleRegistry() {
  titleRegistry.clear();
}
registerResettable(resetTitleRegistry);
export function normalizeTitle(title: string) {
  return title.toLowerCase().trim().replace(/\s+/g, " ");
}
export const titleUniqueRule = defineRule({
  id: "core-title-unique",
  name: "Title Uniqueness",
  description: "Checks that page titles are unique across the site",
  category: "core",
  weight: 5,
  run: async (context) => {
    const { $, url } = context;
    const titleElement = $(DOCUMENT_TITLE);
    const title = titleElement.first().text()?.trim();
    if (!title) {
      return fail(
        "core-title-unique",
        "Page has no title tag",
        { title: null, url }
      );
    }
    if (!context.site) {
      return notMeasured("core-title-unique", "Title uniqueness needs other pages to compare against - only available in a site audit, not a single-page check");
    }
    const normalizedTitle = normalizeTitle(title);
    const existingUrls = titleRegistry.get(normalizedTitle);
    if (existingUrls) {
      existingUrls.push(url);
      return warn(
        "core-title-unique",
        `Duplicate title found on ${existingUrls.length} pages`,
        {
          title,
          normalizedTitle,
          duplicateUrls: existingUrls,
          impact: "Duplicate titles confuse search engines about which page to prioritize",
          recommendation: 'Create unique, descriptive titles for each page (e.g., "Page Topic | Brand Name")'
        }
      );
    }
    titleRegistry.set(normalizedTitle, [url]);
    return pass(
      "core-title-unique",
      "Page title is unique",
      { title, normalizedTitle, url }
    );
  }
});
