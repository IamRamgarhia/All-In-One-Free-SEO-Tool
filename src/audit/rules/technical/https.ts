import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const httpsRule = defineRule({
  id: "technical-https",
  category: "technical",
  severity: "critical",
  weight: 18,
  title: "HTTPS",
  description: "Page should be served over HTTPS",
  recommendation: "Redirect HTTP to HTTPS and update internal links.",
  check: async ({ page }) => {
    try {
      const proto = new URL(page.finalUrl).protocol;
      if (proto !== "https:") return fail("Page is not served over HTTPS", { protocol: proto });
      return pass("Page is served over HTTPS");
    } catch {
      return fail("Could not parse page URL");
    }
  },
});

export const mixedContentRule = defineRule({
  id: "technical-mixed-content",
  category: "technical",
  severity: "high",
  weight: 10,
  title: "No mixed content",
  description: "HTTPS pages should not load http:// subresources",
  recommendation: "Upgrade asset URLs to https:// or protocol-relative URLs.",
  check: async ({ page, $ }) => {
    if (!page.finalUrl.startsWith("https:")) return pass("Page is not HTTPS");
    const offenders: string[] = [];
    $("script[src],link[href],img[src],iframe[src]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      if (src.startsWith("http://")) offenders.push(src);
    });
    if (offenders.length > 0) {
      return warn(`Found ${offenders.length} http:// subresource(s)`, {
        samples: offenders.slice(0, 5),
      });
    }
    return pass("No mixed-content subresources detected");
  },
});
