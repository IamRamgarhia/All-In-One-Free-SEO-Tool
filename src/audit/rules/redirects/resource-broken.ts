import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const MAX_LISTED6 = 20;
export const resourceBrokenRedirectRule = defineRule({
  id: "redirect-resource-broken",
  name: "No Broken Resource Redirects",
  description: "Checks that redirected page resources do not resolve to a 4xx or 5xx status",
  category: "redirect",
  weight: 12,
  run: (context) => {
    const assets = context.assets;
    if (!assets) {
      return notMeasured(
        "redirect-resource-broken",
        "Rendered page assets not captured - available in a full audit, which renders the page in a browser, to measure resource redirects"
      );
    }
    const redirected = assets.filter((asset) => asset.redirectChain.length > 0);
    const broken = redirected.filter((asset) => asset.statusCode >= 400);
    if (broken.length === 0) {
      return pass("redirect-resource-broken", "No redirected resources resolve to a broken (4xx/5xx) response", {
        assetsChecked: assets.length,
        redirectedCount: redirected.length
      });
    }
    return fail(
      "redirect-resource-broken",
      `${broken.length} redirected resource(s) resolve to a 4xx/5xx status; the redirect destination is broken`,
      {
        brokenCount: broken.length,
        assetsChecked: assets.length,
        resources: broken.slice(0, MAX_LISTED6).map((asset) => ({
          url: asset.url,
          resourceType: asset.resourceType,
          finalStatusCode: asset.statusCode,
          chainLength: asset.redirectChain.length
        })),
        recommendation: "Update the resource URLs to point directly at a working destination"
      }
    );
  }
});
