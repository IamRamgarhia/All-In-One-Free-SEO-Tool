import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const robotsDirectiveMismatchRule = defineRule({
  id: "core-robots-directive-mismatch",
  category: "core",
  severity: "medium",
  weight: 6,
  title: "Robots meta vs header consistency",
  description: "Meta robots and X-Robots-Tag should agree on noindex/nofollow",
  recommendation: "Declare noindex/nofollow in one place only.",
  check: async ({ $, response }) => {
    const meta = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const header = (response.headers["x-robots-tag"] ?? "").toLowerCase();
    if (!meta || !header) return pass("Only one robots signal present (or none)");
    const metaNoindex = /\bnoindex\b/.test(meta);
    const headerNoindex = /\bnoindex\b/.test(header);
    if (metaNoindex !== headerNoindex) {
      return warn("noindex differs between meta and X-Robots-Tag", { meta, header });
    }
    return pass("Robots directives are consistent");
  },
});
