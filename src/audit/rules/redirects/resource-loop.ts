import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";

export const MAX_LISTED7 = 20;
export const resourceLoopRedirectRule = defineRule({
  id: "redirect-resource-loop",
  name: "No Resource Redirect Loops",
  description: "Checks that page resources are not caught in redirect loops",
  category: "redirect",
  weight: 12,
  run: (context) => {
    const assets = context.assets;
    if (!assets) {
      return notMeasured(
        "redirect-resource-loop",
        "Rendered page assets not captured - available in a full audit, which renders the page in a browser, to measure resource redirects"
      );
    }
    const looping = assets.filter((asset) => asset.redirectLoop);
    if (looping.length === 0) {
      return pass("redirect-resource-loop", "No resource redirect loops detected", {
        assetsChecked: assets.length
      });
    }
    return fail(
      "redirect-resource-loop",
      `${looping.length} page resource(s) are caught in a redirect loop and never resolve`,
      {
        loopCount: looping.length,
        assetsChecked: assets.length,
        resources: looping.slice(0, MAX_LISTED7).map((asset) => ({
          url: asset.url,
          resourceType: asset.resourceType,
          chainLength: asset.redirectChain.length
        })),
        recommendation: "Fix the redirect target so the chain resolves to a final resource instead of looping"
      }
    );
  }
});
