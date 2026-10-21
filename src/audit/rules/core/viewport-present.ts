import { defineRule, fail, pass } from "@/audit/engine/define-rule";

export const viewportPresentRule = defineRule({
  id: "core-viewport-present",
  category: "core",
  severity: "high",
  weight: 10,
  title: "Viewport meta present",
  description: "Mobile rendering needs a viewport meta tag",
  recommendation:
    'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  check: async ({ $ }) => {
    const content = $('meta[name="viewport"]').attr("content");
    if (!content) return fail("Missing viewport meta tag");
    return pass("Viewport meta is present", { content });
  },
});
