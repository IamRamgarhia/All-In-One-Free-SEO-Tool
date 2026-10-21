import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const robotsMetaRule = defineRule({
  id: "core-robots-meta",
  category: "core",
  severity: "critical",
  weight: 20,
  title: "Robots meta / noindex",
  description: "Detects noindex/nofollow that block indexing",
  recommendation: "Remove noindex/nofollow unless the page must stay out of search.",
  check: async ({ $, response }) => {
    const meta =
      $('meta[name="robots"]').attr("content")?.toLowerCase() ??
      $('meta[name="googlebot"]').attr("content")?.toLowerCase() ??
      "";
    const xrobots = (response.headers["x-robots-tag"] ?? "").toLowerCase();
    const combined = `${meta} ${xrobots}`;
    if (/\bnoindex\b/.test(combined)) {
      return fail("Page is marked noindex", { meta, xrobots });
    }
    if (/\bnofollow\b/.test(combined)) {
      return warn("Page is marked nofollow", { meta, xrobots });
    }
    return pass("No blocking robots directives detected");
  },
});
