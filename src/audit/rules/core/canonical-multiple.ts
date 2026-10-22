import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const canonicalMultipleRule = defineRule({
  id: "core-canonical-multiple",
  category: "core",
  severity: "high",
  weight: 8,
  title: "Single canonical element",
  description: "Multiple canonical tags should not disagree",
  recommendation: "Keep a single <link rel=\"canonical\"> in <head>.",
  check: async ({ $ }) => {
    const hrefs: string[] = [];
    $('link[rel="canonical"]').each((_, el) => {
      const href = $(el).attr("href")?.trim();
      if (href) hrefs.push(href);
    });
    if (hrefs.length <= 1) return pass("At most one canonical element");
    const unique = new Set(hrefs);
    if (unique.size > 1) {
      return warn(`Found ${hrefs.length} canonicals with conflicting hrefs`, {
        hrefs,
      });
    }
    return warn(`Found ${hrefs.length} duplicate canonical elements`, { hrefs });
  },
});
