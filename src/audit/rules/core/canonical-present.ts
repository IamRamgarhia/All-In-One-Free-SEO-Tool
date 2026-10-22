import { defineRule, fail, pass } from "@/audit/engine/define-rule";

export const canonicalPresentRule = defineRule({
  id: "core-canonical-present",
  category: "core",
  severity: "high",
  weight: 15,
  title: "Canonical present",
  description: "Page should declare a canonical URL",
  recommendation: 'Add <link rel="canonical" href="https://…"> in <head>.',
  check: async ({ page }) => {
    if (!page.canonical) return fail("Missing canonical link");
    return pass("Canonical is present", { canonical: page.canonical });
  },
});
