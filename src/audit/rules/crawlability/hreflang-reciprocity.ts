import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import { isSameUrl, lookupPage, resolveHreflangOut } from "@/audit/rules/crawlability/site-page-utils";

export const hreflangReciprocityRule = defineRule({
  id: "crawl-hreflang-reciprocity",
  name: "Hreflang Reciprocity",
  description: "Checks that crawled hreflang targets annotate this page in return (return tags)",
  category: "crawl",
  weight: 6,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-hreflang-reciprocity",
        "Checking hreflang return tags needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const annotations = Object.entries(resolveHreflangOut(context));
    if (annotations.length === 0) {
      return pass("crawl-hreflang-reciprocity", "No hreflang annotations on this page");
    }
    const missingReturn = [];
    let unknown = 0;
    for (const [code, targetUrl] of annotations) {
      const target = lookupPage(site, targetUrl);
      if (!target) {
        unknown++;
        continue;
      }
      const reciprocates = Object.values(target.hreflangOut).some(
        (back) => isSameUrl(site, back, context.url)
      );
      if (!reciprocates) {
        missingReturn.push({ code, target: targetUrl });
      }
    }
    if (unknown === annotations.length) {
      return notMeasured(
        "crawl-hreflang-reciprocity",
        "None of the hreflang targets were crawled, so their return tags cannot be checked",
        { hreflangCount: annotations.length }
      );
    }
    if (missingReturn.length > 0) {
      return warn(
        "crawl-hreflang-reciprocity",
        `${missingReturn.length} hreflang target(s) do not annotate this page in return`,
        {
          missingReturn: missingReturn.slice(0, 10),
          hreflangCount: annotations.length,
          uncheckedTargets: unknown,
          recommendation: "Add reciprocal hreflang annotations on the target pages pointing back at this URL."
        }
      );
    }
    return pass(
      "crawl-hreflang-reciprocity",
      "All crawled hreflang targets annotate this page in return",
      { hreflangCount: annotations.length, uncheckedTargets: unknown }
    );
  }
});
