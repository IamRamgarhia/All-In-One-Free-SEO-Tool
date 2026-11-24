import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { isSameUrl, lookupPage, resolveCanonical2 } from "@/audit/rules/crawlability/site-page-utils";

export const canonicalToNoindexRule2 = defineRule({
  id: "crawl-canonical-to-noindex",
  name: "Canonical Points To Noindex URL",
  description: "Checks that the canonical target is not itself noindex",
  category: "crawl",
  weight: 8,
  run: (context) => {
    const site = context.site;
    if (!site?.pages) {
      return notMeasured(
        "crawl-canonical-to-noindex",
        "Checking the canonical target needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const canonical = resolveCanonical2(context);
    if (!canonical) {
      return pass(
        "crawl-canonical-to-noindex",
        canonical === null ? "Canonical tag is declared but unresolvable - nothing to cross-reference" : "No canonical tag declared",
        { canonical: canonical ?? null }
      );
    }
    if (isSameUrl(site, canonical, context.url)) {
      return pass("crawl-canonical-to-noindex", "Canonical is self-referencing", {
        canonical
      });
    }
    const target = lookupPage(site, canonical);
    if (!target) {
      return notMeasured(
        "crawl-canonical-to-noindex",
        "Canonical target was not crawled, so its robots state is unknown",
        { canonical }
      );
    }
    if (target.noindex) {
      return fail(
        "crawl-canonical-to-noindex",
        "Canonical points to a URL that is noindex",
        {
          canonical,
          impact: "The page delegates indexing to a URL that asks not to be indexed, so search engines may index neither.",
          recommendation: "Point the canonical at an indexable URL, or remove noindex from the canonical target."
        }
      );
    }
    return pass("crawl-canonical-to-noindex", "Canonical target is indexable", { canonical });
  }
});
