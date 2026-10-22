import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const canonicalValidRule = defineRule({
  id: "core-canonical-valid",
  category: "core",
  severity: "high",
  weight: 10,
  title: "Canonical is absolute URL",
  description: "Canonical should be a valid absolute http(s) URL",
  recommendation: "Use an absolute https:// canonical pointing at the preferred URL.",
  check: async ({ page }) => {
    if (!page.canonical) return fail("No canonical to validate");
    try {
      const u = new URL(page.canonical, page.finalUrl);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        return fail("Canonical uses a non-http(s) protocol", { canonical: page.canonical });
      }
      if (!page.canonical.includes("://")) {
        return warn("Canonical is relative — prefer absolute URLs", {
          resolved: u.href,
        });
      }
      return pass("Canonical is a valid absolute URL", { canonical: u.href });
    } catch {
      return fail("Canonical is not a valid URL", { canonical: page.canonical });
    }
  },
});
