import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";
import { registerResettable } from "@/audit/engine/rule-registry";

export const descriptionRegistry = /* @__PURE__ */ new Map();
export function resetDescriptionRegistry() {
  descriptionRegistry.clear();
}
registerResettable(resetDescriptionRegistry);
export function normalizeDescription(description: string) {
  return description.toLowerCase().trim().replace(/\s+/g, " ");
}
export const duplicateDescriptionRule = defineRule({
  id: "content-duplicate-description",
  name: "Duplicate Description",
  description: "Checks for duplicate meta descriptions across the site",
  category: "content",
  weight: 5,
  run: async (context) => {
    const { $, url } = context;
    const descriptionElement = $('meta[name="description"]');
    const description = descriptionElement.attr("content")?.trim();
    if (!description) {
      return fail("content-duplicate-description", "Page has no meta description", {
        description: null,
        url,
        impact: "Missing meta description reduces control over how the page appears in search results",
        recommendation: "Add a unique, compelling meta description between 120-160 characters"
      });
    }
    if (!context.site) {
      return notMeasured("content-duplicate-description", "Description uniqueness needs other pages to compare against - only available in a site audit, not a single-page check");
    }
    if (description.length < 50) {
      const normalizedDescription2 = normalizeDescription(description);
      const existingUrls2 = descriptionRegistry.get(normalizedDescription2);
      if (existingUrls2) {
        existingUrls2.push(url);
        return warn(
          "content-duplicate-description",
          `Duplicate description found on ${existingUrls2.length} pages (also too short)`,
          {
            description,
            normalizedDescription: normalizedDescription2,
            length: description.length,
            duplicateUrls: existingUrls2,
            impact: "Duplicate descriptions confuse search engines and reduce click-through rates",
            recommendation: "Create unique, compelling descriptions for each page (120-160 characters)"
          }
        );
      }
      descriptionRegistry.set(normalizedDescription2, [url]);
      return warn("content-duplicate-description", "Meta description is too short", {
        description,
        length: description.length,
        url,
        recommendation: "Expand description to 120-160 characters for optimal display in search results"
      });
    }
    const normalizedDescription = normalizeDescription(description);
    const existingUrls = descriptionRegistry.get(normalizedDescription);
    if (existingUrls) {
      existingUrls.push(url);
      return warn(
        "content-duplicate-description",
        `Duplicate description found on ${existingUrls.length} pages`,
        {
          description,
          normalizedDescription,
          length: description.length,
          duplicateUrls: existingUrls,
          impact: "Duplicate descriptions confuse search engines about which page to display. They also reduce click-through rates by not differentiating pages.",
          recommendation: "Create unique, descriptive meta descriptions for each page that accurately summarize the specific content"
        }
      );
    }
    descriptionRegistry.set(normalizedDescription, [url]);
    return pass("content-duplicate-description", "Meta description is unique", {
      description,
      normalizedDescription,
      length: description.length,
      url,
      isOptimalLength: description.length >= 120 && description.length <= 160
    });
  }
});
