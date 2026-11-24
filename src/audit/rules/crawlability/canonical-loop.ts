import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { walkCanonical } from "@/audit/rules/crawlability/site-page-utils";

export const canonicalLoopRule2 = defineRule({
  id: "crawl-canonical-loop",
  name: "Canonical Loop",
  description: "Checks that following canonical targets does not loop back to a visited URL",
  category: "crawl",
  weight: 8,
  run: (context) => {
    if (!context.site?.pages) {
      return notMeasured(
        "crawl-canonical-loop",
        "Following the canonical chain needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const walk = walkCanonical(context);
    switch (walk.kind) {
      case "none":
        return pass("crawl-canonical-loop", "No canonical tag declared");
      case "self":
        return pass("crawl-canonical-loop", "Canonical is self-referencing");
      case "ok":
        return pass("crawl-canonical-loop", "Canonical chain resolves to a final destination", {
          canonical: walk.target
        });
      case "unknown":
        return notMeasured(
          "crawl-canonical-loop",
          "Canonical chain leaves the crawled set, so a loop cannot be ruled out",
          { canonical: walk.target || void 0 }
        );
      case "chain":
        if (!walk.resolved) {
          return notMeasured(
            "crawl-canonical-loop",
            "Canonical chain leaves the crawled set, so a loop cannot be ruled out",
            { canonical: walk.target, targetCanonical: walk.targetCanonical }
          );
        }
        return pass("crawl-canonical-loop", "Canonical chain does not loop", {
          canonical: walk.target,
          targetCanonical: walk.targetCanonical
        });
      case "loop":
        return fail(
          "crawl-canonical-loop",
          "Canonical targets form a loop with no final destination",
          {
            path: walk.path,
            impact: "A canonical loop gives search engines no URL to index; they pick a canonical themselves or index neither page.",
            recommendation: "Make every page in the loop canonicalize to a single final URL."
          }
        );
    }
  }
});
