import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { getOwnPageInfo } from "@/audit/rules/crawlability/site-page-utils";

export const hreflangDisallowedTargetRule = defineRule({
  id: "crawl-hreflang-disallowed-target",
  name: "Disallowed URL Has Incoming Hreflang",
  description: "Checks that no other page points hreflang annotations at this robots.txt-disallowed page",
  category: "crawl",
  weight: 7,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-hreflang-disallowed-target",
        "Checking incoming hreflang needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const own = getOwnPageInfo(context);
    if (!own) {
      return notMeasured(
        "crawl-hreflang-disallowed-target",
        "This page has no crawl record, so its robots.txt state is unknown"
      );
    }
    if (!own.disallowed) {
      return pass(
        "crawl-hreflang-disallowed-target",
        "Page is not disallowed by robots.txt"
      );
    }
    const ownKey = site.normalize(context.url);
    const referring = [];
    for (const [pageUrl, info] of site.pages) {
      if (pageUrl === ownKey) continue;
      for (const targetUrl of Object.values(info.hreflangOut)) {
        if (site.normalize(targetUrl) === ownKey) {
          referring.push(pageUrl);
          break;
        }
      }
    }
    if (referring.length > 0) {
      return fail(
        "crawl-hreflang-disallowed-target",
        `Page is disallowed by robots.txt but ${referring.length} crawled page(s) point hreflang annotations at it`,
        {
          referringPages: referring.slice(0, 10),
          referringCount: referring.length,
          impact: "Crawlers cannot fetch this page, so its hreflang return tags are never seen and the cluster may be ignored.",
          recommendation: "Remove the robots.txt disallow for this URL, or remove the hreflang annotations pointing at it."
        }
      );
    }
    return pass(
      "crawl-hreflang-disallowed-target",
      "Page is disallowed but no crawled page points hreflang annotations at it"
    );
  }
});
