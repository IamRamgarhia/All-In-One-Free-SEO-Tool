import { bodyText } from "@/audit/rules/content/utils/visible-text";
import { defineRule, fail, notMeasured, pass } from "@/audit/engine/define-rule";
import { registerResettable } from "@/audit/engine/rule-registry";

export const contentHashRegistry = /* @__PURE__ */ new Map();
export function resetDuplicateContentRegistry() {
  contentHashRegistry.clear();
}
registerResettable(resetDuplicateContentRegistry);
export const duplicateExactRule = defineRule({
  id: "content-duplicate-exact",
  name: "Exact Duplicate Content",
  description: "Detects exact duplicate content across crawled pages using content hashing",
  category: "content",
  weight: 8,
  run: async (context) => {
    if (!context.site) {
      return notMeasured("content-duplicate-exact", "Duplicate content detection needs other pages to compare against - only available in a site audit, not a single-page check");
    }
    const { $, url } = context;
    const bodyText2 = bodyText($);
    if (!bodyText2 || bodyText2.length < 50) {
      return pass(
        "content-duplicate-exact",
        "Page has insufficient content for duplicate detection",
        {
          url,
          textLength: bodyText2.length,
          reason: "skipped"
        }
      );
    }
    const crypto2 = await import("crypto");
    const hash = crypto2.createHash("md5").update(bodyText2).digest("hex");
    const existingUrl = contentHashRegistry.get(hash);
    if (existingUrl) {
      return fail(
        "content-duplicate-exact",
        `Exact duplicate content detected (matches ${existingUrl})`,
        {
          url,
          duplicateOf: existingUrl,
          contentHash: hash,
          textLength: bodyText2.length,
          impact: "Exact duplicate content confuses search engines about which page to rank and dilutes link equity",
          recommendation: "Consolidate duplicate pages using canonical tags, 301 redirects, or by removing the duplicate. Ensure each URL serves unique content."
        }
      );
    }
    contentHashRegistry.set(hash, url);
    return pass(
      "content-duplicate-exact",
      "Content is unique (no exact duplicates detected)",
      {
        url,
        contentHash: hash,
        textLength: bodyText2.length
      }
    );
  }
});
