import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import type { FailedRequestInfo } from "@/audit/types";

export const INDEXING_CRITICAL_TYPES = /* @__PURE__ */ new Set(["script", "stylesheet", "document", "fetch", "xhr"]);
export function countByType(requests: FailedRequestInfo[]) {
  const counts: Record<string, number> = {};
  for (const request of requests) {
    counts[request.resourceType] = (counts[request.resourceType] ?? 0) + 1;
  }
  return counts;
}
export function describe(request: FailedRequestInfo) {
  return `${request.resourceType} ${request.failure}: ${request.url}`;
}
export const failedRequestsRule = defineRule({
  id: "js-failed-requests",
  name: "Failed Resource Requests",
  description: "Reports scripts, stylesheets and other subresources that failed to load while rendering",
  category: "js",
  weight: 8,
  run: (context) => {
    const diagnostics = context.renderDiagnostics;
    if (!diagnostics) {
      return notMeasured(
        "js-failed-requests",
        "Rendered DOM not available - available in a full audit, which renders the page in a browser, to capture failed resource requests"
      );
    }
    const failures = diagnostics.failedRequests;
    const critical = failures.filter(
      (request) => INDEXING_CRITICAL_TYPES.has(request.resourceType)
    );
    const details = {
      failedCount: failures.length,
      indexingCriticalCount: critical.length,
      byResourceType: countByType(failures),
      failures: failures.slice(0, 10).map(describe)
    };
    if (failures.length === 0) {
      return pass("js-failed-requests", "All page resources loaded successfully", details);
    }
    if (critical.length > 0) {
      return fail(
        "js-failed-requests",
        `${critical.length} script/stylesheet request(s) failed while rendering: ${describe(critical[0])}`,
        {
          ...details,
          impact: "A script that never loads cannot render the content it is responsible for, and a missing stylesheet can leave content hidden from a rendering crawler."
        }
      );
    }
    return warn(
      "js-failed-requests",
      `${failures.length} non-critical resource request(s) failed while rendering: ${describe(failures[0])}`,
      details
    );
  }
});
