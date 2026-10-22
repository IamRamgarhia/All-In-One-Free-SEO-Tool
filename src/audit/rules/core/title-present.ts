import { defineRule, fail, pass } from "@/audit/engine/define-rule";

export const titlePresentRule = defineRule({
  id: "core-title-present",
  category: "core",
  severity: "critical",
  weight: 25,
  title: "Title tag present",
  description: "Checks that a <title> tag exists in the document head",
  recommendation: "Add a unique <title> inside <head> (50–60 characters).",
  check: async ({ $, page }) => {
    const title = page.title ?? $("head > title").first().text().trim();
    if (!title) {
      return fail("No <title> tag found (or it is empty)", { found: false });
    }
    return pass("Title tag is present", { title });
  },
});
