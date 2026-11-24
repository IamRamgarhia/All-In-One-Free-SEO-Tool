import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { isSameUrl, lookupPage, resolveCanonical2 } from "@/audit/rules/crawlability/site-page-utils";

export const canonicalToDisallowedRule = defineRule({
  id: "crawl-canonical-to-disallowed",
  name: "Canonical Points To Disallowed URL",
  description: "Checks that the canonical target is not disallowed by robots.txt",
  category: "crawl",
  weight: 8,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-canonical-to-disallowed",
        "Checking the canonical target needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const canonical = resolveCanonical2(context);
    if (!canonical) {
      return pass(
        "crawl-canonical-to-disallowed",
        canonical === null ? "Canonical tag is declared but unresolvable - nothing to cross-reference" : "No canonical tag declared",
        { canonical: canonical ?? null }
      );
    }
    if (isSameUrl(site, canonical, context.url)) {
      return pass("crawl-canonical-to-disallowed", "Canonical is self-referencing", {
        canonical
      });
    }
    const target = lookupPage(site, canonical);
    if (!target) {
      return notMeasured(
        "crawl-canonical-to-disallowed",
        "Canonical target was not crawled, so its robots.txt state is unknown",
        { canonical }
      );
    }
    if (target.disallowed) {
      return fail(
        "crawl-canonical-to-disallowed",
        "Canonical points to a URL disallowed by robots.txt",
        {
          canonical,
          impact: "Crawlers are told not to fetch the canonical target, so the canonical signal may never be processed and neither URL gets indexed cleanly.",
          recommendation: "Point the canonical at a crawlable URL, or remove the robots.txt disallow for the target."
        }
      );
    }
    return pass("crawl-canonical-to-disallowed", "Canonical target is crawlable", { canonical });
  }
});
