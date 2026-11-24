import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import { walkCanonical } from "@/audit/rules/crawlability/site-page-utils";

export const canonicalChainRule = defineRule({
  id: "crawl-canonical-chain",
  name: "Canonical Chain",
  description: "Checks that the canonical target is not itself canonicalized to a different URL",
  category: "crawl",
  weight: 6,
  run: (context) => {
    if (!context.site?.pages) {
      return notMeasured(
        "crawl-canonical-chain",
        "Following the canonical chain needs per-page crawl state - only available in a site audit, not a single-page check"
      );
    }
    const walk = walkCanonical(context);
    switch (walk.kind) {
      case "none":
        return pass("crawl-canonical-chain", "No canonical tag declared");
      case "self":
        return pass("crawl-canonical-chain", "Canonical is self-referencing");
      case "ok":
        return pass("crawl-canonical-chain", "Canonical target is a final destination", {
          canonical: walk.target
        });
      case "unknown":
        return notMeasured(
          "crawl-canonical-chain",
          "Canonical chain leaves the crawled set, so its end is unknown",
          { canonical: walk.target || void 0 }
        );
      case "loop":
        return pass("crawl-canonical-chain", "Canonical forms a loop - reported by crawl-canonical-loop", {
          path: walk.path
        });
      case "chain":
        return warn(
          "crawl-canonical-chain",
          "Canonical points to a URL that is itself canonicalized elsewhere",
          {
            canonical: walk.target,
            targetCanonical: walk.targetCanonical,
            chainResolved: walk.resolved,
            impact: "Canonical chains dilute the signal and may resolve to a different URL than intended.",
            recommendation: `Point the canonical directly at ${walk.targetCanonical}.`
          }
        );
    }
  }
});
