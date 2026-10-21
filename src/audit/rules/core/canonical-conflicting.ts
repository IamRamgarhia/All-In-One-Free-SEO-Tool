import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { normalizeUrl } from "@/audit/crawler/link-graph";

export const canonicalConflictingRule = defineRule({
  id: "core-canonical-conflicting",
  category: "core",
  severity: "high",
  weight: 10,
  title: "HTML vs header canonical",
  description: "HTML canonical and Link header should agree",
  recommendation: "Use one canonical signal — prefer HTML <link rel=canonical>.",
  check: async ({ page, response }) => {
    const linkHeader = response.headers["link"] ?? "";
    const m = linkHeader.match(/<([^>]+)>\s*;\s*rel="?canonical"?/i);
    const headerCanon = m?.[1];
    if (!page.canonical && !headerCanon) return pass("No canonical signals");
    if (!page.canonical || !headerCanon) return pass("Only one canonical signal present");
    try {
      const a = normalizeUrl(new URL(page.canonical, page.finalUrl).href);
      const b = normalizeUrl(new URL(headerCanon, page.finalUrl).href);
      if (a !== b) {
        return warn("HTML canonical conflicts with Link header", { html: a, header: b });
      }
      return pass("HTML and header canonicals agree");
    } catch {
      return fail("Could not parse canonical signals");
    }
  },
});
