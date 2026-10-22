import { defineRule, fail, pass, unmeasured } from "@/audit/engine/define-rule";
import { normalizeUrl } from "@/audit/crawler/link-graph";

export const canonicalLoopRule = defineRule({
  id: "core-canonical-loop",
  category: "core",
  severity: "critical",
  weight: 12,
  title: "No canonical loop",
  description: "Detects circular canonical chains within the crawl",
  recommendation: "Break the loop — each URL should canonicalize to a final self-referencing URL.",
  requiresCrawl: true,
  check: async ({ page, crawl }) => {
    if (!crawl) return unmeasured("Needs a multi-page crawl");
    if (!page.canonical) return pass("No canonical on this page");

    const byUrl = new Map(
      crawl.pages.map((p) => [normalizeUrl(p.finalUrl), p] as const),
    );
    const seen = new Set<string>();
    let current = normalizeUrl(page.finalUrl);

    for (let i = 0; i < 8; i++) {
      if (seen.has(current)) {
        return fail("Canonical loop detected", { chain: Array.from(seen) });
      }
      seen.add(current);
      const node = byUrl.get(current);
      if (!node?.canonical) break;
      let next: string;
      try {
        next = normalizeUrl(new URL(node.canonical, node.finalUrl).href);
      } catch {
        break;
      }
      if (next === current) break;
      current = next;
    }
    return pass("No canonical loop found in crawl graph");
  },
});
