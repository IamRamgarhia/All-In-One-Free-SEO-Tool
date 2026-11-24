import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { lookupPage, resolveHreflangOut } from "@/audit/rules/crawlability/site-page-utils";

export const hreflangToDisallowedRule = defineRule({
  id: "crawl-hreflang-to-disallowed",
  name: "Hreflang To Disallowed URLs",
  description: "Checks that outgoing hreflang annotations do not point to robots.txt-disallowed URLs",
  category: "crawl",
  weight: 7,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-hreflang-to-disallowed",
        "Checking hreflang targets needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const annotations = Object.entries(resolveHreflangOut(context));
    if (annotations.length === 0) {
      return pass("crawl-hreflang-to-disallowed", "No hreflang annotations on this page");
    }
    const flagged = [];
    let unknown = 0;
    for (const [code, targetUrl] of annotations) {
      const target = lookupPage(site, targetUrl);
      if (!target) {
        unknown++;
        continue;
      }
      if (target.disallowed) {
        flagged.push({ code, url: targetUrl });
      }
    }
    if (flagged.length > 0) {
      return fail(
        "crawl-hreflang-to-disallowed",
        `${flagged.length} hreflang annotation(s) point to robots.txt-disallowed URL(s)`,
        {
          flagged: flagged.slice(0, 10),
          hreflangCount: annotations.length,
          impact: "Crawlers are told not to fetch the hreflang target, so the return annotation there cannot be confirmed and the cluster may be ignored.",
          recommendation: "Remove the robots.txt disallow for the hreflang targets, or drop the annotations pointing at them."
        }
      );
    }
    if (unknown === annotations.length) {
      return notMeasured(
        "crawl-hreflang-to-disallowed",
        "None of the hreflang targets were crawled, so their robots.txt state is unknown",
        { hreflangCount: annotations.length }
      );
    }
    return pass(
      "crawl-hreflang-to-disallowed",
      "No hreflang annotation points to a disallowed URL",
      { hreflangCount: annotations.length, uncheckedTargets: unknown }
    );
  }
});
