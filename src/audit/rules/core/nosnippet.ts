import { defineRule, pass, warn } from "@/audit/engine/define-rule";

export const nosnippetRule = defineRule({
  id: "core-nosnippet",
  category: "core",
  severity: "medium",
  weight: 5,
  title: "Nosnippet / max-snippet",
  description: "Detects directives that suppress search snippets",
  recommendation: "Remove nosnippet/max-snippet:0 unless intentionally blocking snippets.",
  check: async ({ $, response }) => {
    const meta = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const header = (response.headers["x-robots-tag"] ?? "").toLowerCase();
    const combined = `${meta} ${header}`;
    if (/\bnosnippet\b/.test(combined) || /max-snippet\s*:\s*0/.test(combined)) {
      return warn("Snippet-suppressing robots directive found", { meta, header });
    }
    return pass("No nosnippet / max-snippet:0 directive");
  },
});
