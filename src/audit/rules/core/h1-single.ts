import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const h1SingleRule = defineRule({
  id: "core-h1-single",
  category: "core",
  severity: "medium",
  weight: 8,
  title: "Single H1",
  description: "Page should have only one H1",
  recommendation: "Use one H1; demote other headings to H2–H6.",
  check: async ({ page }) => {
    if (page.h1s.length <= 1) {
      return pass(page.h1s.length === 1 ? "Exactly one H1" : "No H1 (covered elsewhere)");
    }
    return warn(`Found ${page.h1s.length} H1 elements`, { count: page.h1s.length });
  },
});
