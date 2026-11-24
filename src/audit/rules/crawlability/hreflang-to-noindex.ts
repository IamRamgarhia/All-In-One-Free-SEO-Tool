import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { lookupPage, resolveHreflangOut } from "@/audit/rules/crawlability/site-page-utils";

export const hreflangToNoindexRule2 = defineRule({
  id: "crawl-hreflang-to-noindex",
  name: "Hreflang To Noindex URLs",
  description: "Checks that outgoing hreflang annotations do not point to noindex URLs",
  category: "crawl",
  weight: 8,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-hreflang-to-noindex",
        "Checking hreflang targets needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const annotations = Object.entries(resolveHreflangOut(context));
    if (annotations.length === 0) {
      return pass("crawl-hreflang-to-noindex", "No hreflang annotations on this page");
    }
    const flagged = [];
    let unknown = 0;
    for (const [code, targetUrl] of annotations) {
      const target = lookupPage(site, targetUrl);
      if (!target) {
        unknown++;
        continue;
      }
      if (target.noindex) {
        flagged.push({ code, url: targetUrl });
      }
    }
    if (flagged.length > 0) {
      return fail(
        "crawl-hreflang-to-noindex",
        `${flagged.length} hreflang annotation(s) point to noindex URL(s)`,
        {
          flagged: flagged.slice(0, 10),
          hreflangCount: annotations.length,
          impact: "Hreflang asks search engines to serve a URL that asks not to be indexed, so the localized cluster can break down.",
          recommendation: "Remove noindex from the hreflang targets, or drop the annotations pointing at them."
        }
      );
    }
    if (unknown === annotations.length) {
      return notMeasured(
        "crawl-hreflang-to-noindex",
        "None of the hreflang targets were crawled, so their robots state is unknown",
        { hreflangCount: annotations.length }
      );
    }
    return pass("crawl-hreflang-to-noindex", "No hreflang annotation points to a noindex URL", {
      hreflangCount: annotations.length,
      uncheckedTargets: unknown
    });
  }
});
