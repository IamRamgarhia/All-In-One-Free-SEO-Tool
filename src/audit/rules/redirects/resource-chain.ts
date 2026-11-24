import { defineRule, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const MAX_LISTED8 = 20;
export const resourceChainRedirectRule = defineRule({
  id: "redirect-resource-chain",
  name: "No Resource Redirect Chains",
  description: "Checks that page resources do not resolve through multi-hop redirect chains",
  category: "redirect",
  weight: 8,
  run: (context) => {
    const assets = context.assets;
    if (!assets) {
      return notMeasured(
        "redirect-resource-chain",
        "Rendered page assets not captured - available in a full audit, which renders the page in a browser, to measure resource redirects"
      );
    }
    const singleHopCount = assets.filter((asset) => asset.redirectChain.length === 1).length;
    const chained = assets.filter((asset) => !asset.redirectLoop && asset.redirectChain.length >= 2);
    if (chained.length === 0) {
      return pass("redirect-resource-chain", "No multi-hop resource redirect chains detected", {
        assetsChecked: assets.length,
        singleHopRedirects: singleHopCount
      });
    }
    return warn(
      "redirect-resource-chain",
      `${chained.length} page resource(s) resolve through redirect chains of 2 or more hops`,
      {
        chainedCount: chained.length,
        assetsChecked: assets.length,
        singleHopRedirects: singleHopCount,
        resources: chained.slice(0, MAX_LISTED8).map((asset) => ({
          url: asset.url,
          resourceType: asset.resourceType,
          chainLength: asset.redirectChain.length,
          finalStatusCode: asset.statusCode
        })),
        recommendation: "Update the resource URLs to point directly at the final destination"
      }
    );
  }
});
