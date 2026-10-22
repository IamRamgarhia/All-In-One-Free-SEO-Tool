import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const openGraphBasicRule = defineRule({
  id: "core-open-graph-basic",
  category: "core",
  severity: "low",
  weight: 4,
  title: "Open Graph basics",
  description: "og:title and og:description help social/AI previews",
  recommendation: "Add og:title, og:description, and og:image meta tags.",
  check: async ({ $ }) => {
    const title = $('meta[property="og:title"]').attr("content");
    const desc = $('meta[property="og:description"]').attr("content");
    const image = $('meta[property="og:image"]').attr("content");
    const missing = [
      !title && "og:title",
      !desc && "og:description",
      !image && "og:image",
    ].filter(Boolean);
    if (missing.length === 3) {
      return warn("No Open Graph tags found", { missing });
    }
    if (missing.length > 0) {
      return warn(`Incomplete Open Graph tags: ${missing.join(", ")}`, { missing });
    }
    return pass("Basic Open Graph tags are present");
  },
});
