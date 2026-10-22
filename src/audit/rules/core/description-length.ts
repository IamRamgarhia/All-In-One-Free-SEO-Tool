import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const descriptionLengthRule = defineRule({
  id: "core-description-length",
  category: "core",
  severity: "low",
  weight: 5,
  title: "Meta description length",
  description: "Meta description should be about 120–160 characters",
  recommendation: "Keep the meta description between 120 and 160 characters.",
  check: async ({ page }) => {
    const d = page.metaDescription;
    if (!d) return fail("No meta description to measure");
    const len = d.length;
    if (len < 70) return warn(`Description is short (${len} chars)`, { length: len });
    if (len > 160) return warn(`Description is long (${len} chars)`, { length: len });
    return pass(`Description length is ${len} characters`, { length: len });
  },
});
