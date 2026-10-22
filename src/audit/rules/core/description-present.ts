import { defineRule, fail, pass } from "@/audit/engine/define-rule";

export const descriptionPresentRule = defineRule({
  id: "core-description-present",
  category: "core",
  severity: "high",
  weight: 20,
  title: "Meta description present",
  description: "Checks that a meta description exists",
  recommendation:
    'Add <meta name="description" content="..."> with 120–160 characters.',
  check: async ({ page }) => {
    if (!page.metaDescription) {
      return fail("Missing meta description");
    }
    return pass("Meta description is present", {
      description: page.metaDescription.slice(0, 160),
    });
  },
});
