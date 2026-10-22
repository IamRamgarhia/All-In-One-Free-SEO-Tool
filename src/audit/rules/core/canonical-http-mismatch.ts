import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const canonicalHttpMismatchRule = defineRule({
  id: "core-canonical-http-mismatch",
  category: "core",
  severity: "medium",
  weight: 6,
  title: "Canonical protocol matches page",
  description: "Canonical protocol should match the page protocol",
  recommendation: "Prefer https:// for both the page and its canonical.",
  check: async ({ page }) => {
    if (!page.canonical) return fail("No canonical");
    try {
      const pageProto = new URL(page.finalUrl).protocol;
      const canonProto = new URL(page.canonical, page.finalUrl).protocol;
      if (pageProto !== canonProto) {
        return warn("Canonical protocol differs from page protocol", {
          page: pageProto,
          canonical: canonProto,
        });
      }
      return pass("Canonical protocol matches page");
    } catch {
      return fail("Could not parse canonical URL");
    }
  },
});
