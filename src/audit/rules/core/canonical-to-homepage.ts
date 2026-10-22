import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { normalizeUrl } from "@/audit/crawler/link-graph";

export const canonicalToHomepageRule = defineRule({
  id: "core-canonical-to-homepage",
  category: "core",
  severity: "high",
  weight: 10,
  title: "Canonical not forced to homepage",
  description: "Inner pages should not canonicalize to the homepage",
  recommendation: "Each page should self-canonicalize (or to its preferred variant).",
  check: async ({ page, crawl }) => {
    if (!page.canonical) return fail("No canonical");
    const start = crawl?.startUrl ?? page.finalUrl;
    let home: string;
    try {
      home = normalizeUrl(new URL("/", start).href);
    } catch {
      return pass("Could not resolve homepage");
    }
    const self = normalizeUrl(page.finalUrl);
    const canon = normalizeUrl(new URL(page.canonical, page.finalUrl).href);
    if (self !== home && canon === home) {
      return warn("Canonical points at the homepage instead of this page", {
        canonical: canon,
      });
    }
    return pass("Canonical is not incorrectly pointing at the homepage");
  },
});
