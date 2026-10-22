import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const titleLengthRule = defineRule({
  id: "core-title-length",
  category: "core",
  severity: "medium",
  weight: 8,
  title: "Title length",
  description: "Title should be roughly 30–60 characters for SERP display",
  recommendation: "Keep the title between 30 and 60 characters.",
  check: async ({ page }) => {
    const title = page.title;
    if (!title) return fail("No title to measure length");
    const len = title.length;
    if (len < 30) return warn(`Title is short (${len} chars)`, { length: len });
    if (len > 60) return warn(`Title is long (${len} chars)`, { length: len });
    return pass(`Title length is ${len} characters`, { length: len });
  },
});
