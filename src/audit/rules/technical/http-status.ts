import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const httpOkRule = defineRule({
  id: "technical-http-ok",
  category: "technical",
  severity: "critical",
  weight: 20,
  title: "Valid HTTP response",
  description: "Page should return a successful HTTP status",
  recommendation: "Fix server errors and broken URLs so the page returns 200.",
  check: async ({ page }) => {
    if (page.status === 0) return fail("Fetch failed — no HTTP status", { status: 0 });
    if (page.status >= 500) return fail(`Server error HTTP ${page.status}`, { status: page.status });
    if (page.status === 404) return fail("HTTP 404 Not Found", { status: 404 });
    if (page.status >= 400) return fail(`Client error HTTP ${page.status}`, { status: page.status });
    if (page.status >= 300) return warn(`Unexpected redirect status ${page.status}`, { status: page.status });
    return pass(`HTTP ${page.status}`, { status: page.status });
  },
});

export const soft404Rule = defineRule({
  id: "technical-soft-404",
  category: "technical",
  severity: "high",
  weight: 12,
  title: "Soft 404 detection",
  description: "200 responses that look like error pages",
  recommendation: "Return a real 404 status for missing pages; do not serve thin error HTML as 200.",
  check: async ({ page }) => {
    if (page.status !== 200) return pass("Not a 200 response");
    const title = (page.title ?? "").toLowerCase();
    const looksMissing =
      /404|not found|page introuvable|doesn't exist|does not exist/.test(title) ||
      (page.wordCount > 0 && page.wordCount < 30 && /404|not found/.test(page.rawHtml.toLowerCase()));
    if (looksMissing) {
      return fail("Page looks like a soft 404 (200 with error content)", {
        title: page.title,
        wordCount: page.wordCount,
      });
    }
    return pass("No soft-404 signals");
  },
});
