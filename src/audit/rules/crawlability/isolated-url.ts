import type { DiscoverySource } from "@/audit/types";
import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const SOURCE_LABELS: Record<string, string> = {
  link: "an internal link",
  canonical: "a canonical tag",
  redirect: "a redirect",
  sitemap: "the XML sitemap",
  entry: "the crawl entry point"
};
export const REPORTABLE_SOURCES: DiscoverySource[] = ["canonical", "redirect", "sitemap"];
export const crawlIsolatedUrlRule = defineRule({
  id: "crawl-isolated-url",
  name: "Isolated URL",
  description: "Checks that the page is reachable through ordinary internal links, not only canonicals, redirects or the sitemap",
  category: "crawl",
  weight: 8,
  run: (context) => {
    const site = context.site;
    const discovery = site?.discoverySourceByUrl;
    if (!site || !discovery) {
      return notMeasured(
        "crawl-isolated-url",
        "Checking how the URL was discovered needs the crawl's per-URL discovery records - only available in a site audit, not a single-page check"
      );
    }
    const url = site.normalize(context.url);
    const sources = discovery.get(url);
    if (!sources) {
      return notMeasured(
        "crawl-isolated-url",
        "No discovery record for this URL - its reachability cannot be judged",
        { url: context.url }
      );
    }
    const isolatedBase = /* @__PURE__ */ new Set();
    for (const [u, s] of discovery) {
      if (!s.has("link") && !s.has("entry")) {
        isolatedBase.add(u);
      }
    }
    const isolatedPropagated = new Set(isolatedBase);
    for (const [u, s] of discovery) {
      if (isolatedBase.has(u) || !s.has("link") || s.has("entry")) continue;
      const linkers2 = site.inboundLinksByUrl.get(u);
      if (!linkers2 || linkers2.size === 0) continue;
      let allIsolated = true;
      for (const from of linkers2) {
        if (!isolatedBase.has(from)) {
          allIsolated = false;
          break;
        }
      }
      if (allIsolated) {
        isolatedPropagated.add(u);
      }
    }
    if (sources.has("entry") || url === site.entryUrl) {
      return pass("crawl-isolated-url", "Crawl entry point", {
        discoverySources: [...sources]
      });
    }
    if (!sources.has("link")) {
      const foundVia = REPORTABLE_SOURCES.filter((s) => sources.has(s)).map(
        (s) => SOURCE_LABELS[s]
      );
      return fail(
        "crawl-isolated-url",
        `URL is isolated: it can only be found via ${foundVia.join(" and ") || "non-link sources"}`,
        {
          isolationKind: "no-inbound-links",
          discoverySources: [...sources],
          foundVia,
          impact: "Without internal anchor links, search engines may never discover this page, and it receives no internal link equity.",
          recommendation: "Link to this page from ordinary anchors on relevant, indexable pages; do not rely on canonicals, redirects or the sitemap for discovery."
        }
      );
    }
    const linkers = site.inboundLinksByUrl.get(url);
    if (!linkers || linkers.size === 0) {
      return notMeasured(
        "crawl-isolated-url",
        "Discovery records show an inbound link but the link graph has none - the records disagree",
        { discoverySources: [...sources] }
      );
    }
    if (site.pages) {
      const linkerInfos = [...linkers].map((from) => site.pages?.get(from));
      if (linkerInfos.length > 0 && linkerInfos.every((info) => info && info.noindex && !info.nofollow)) {
        return fail(
          "crawl-isolated-url",
          `URL is only reachable through noindex,follow page(s): ${[...linkers].slice(0, 3).join(", ")}`,
          {
            isolationKind: "noindex-follow-only",
            discoverySources: [...sources],
            inboundLinkers: [...linkers],
            impact: "Once the noindex linking pages drop out of the index, search engines lose the only path to this URL.",
            recommendation: "Link to this page from at least one indexable page so the discovery path survives."
          }
        );
      }
    }
    let allLinkersIsolated = true;
    for (const from of linkers) {
      if (!isolatedPropagated.has(from)) {
        allLinkersIsolated = false;
        break;
      }
    }
    if (allLinkersIsolated) {
      return fail(
        "crawl-isolated-url",
        `URL is only linked from other isolated URLs: ${[...linkers].slice(0, 3).join(", ")}`,
        {
          isolationKind: "isolated-linkers-only",
          discoverySources: [...sources],
          inboundLinkers: [...linkers],
          impact: "The only links to this page come from pages that are themselves unreachable by links, so the whole chain is invisible to link-based discovery.",
          recommendation: "Link to this page - or to the pages linking to it - from ordinarily linked, indexable content."
        }
      );
    }
    return pass("crawl-isolated-url", "URL is reachable through internal links", {
      discoverySources: [...sources],
      inboundLinkerCount: linkers.size
    });
  }
});
