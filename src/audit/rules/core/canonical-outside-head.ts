import { defineRule, fail, pass } from "@/audit/engine/define-rule";

export const canonicalOutsideHeadRule = defineRule({
  id: "core-canonical-outside-head",
  category: "core",
  severity: "high",
  weight: 8,
  title: "Canonical inside head",
  description: "Canonical links outside <head> are ignored by search engines",
  recommendation: "Move <link rel=\"canonical\"> into the <head>.",
  check: async ({ $ }) => {
    const inHead = $("head link[rel='canonical']").length;
    const total = $("link[rel='canonical']").length;
    if (total > 0 && inHead === 0) {
      return fail("Canonical found outside <head>");
    }
    return pass("Canonical is inside <head> (or absent)");
  },
});
