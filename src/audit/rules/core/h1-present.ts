import { defineRule, fail, pass } from "@/audit/engine/define-rule";

export const h1PresentRule = defineRule({
  id: "core-h1-present",
  category: "core",
  severity: "high",
  weight: 15,
  title: "H1 present",
  description: "Page should have at least one H1",
  recommendation: "Add a single H1 that describes the page topic.",
  check: async ({ page }) => {
    if (page.h1s.length === 0) return fail("No H1 found on the page");
    return pass("H1 is present", { h1: page.h1s[0] });
  },
});
