import { defineRule, fail, pass, unmeasured, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";
import { compareRawVsRendered } from "@/audit/rendering/dom-comparator";

export const ssrCheckRule = defineRule({
  id: "js-ssr-check",
  category: "js",
  severity: "high",
  weight: 12,
  title: "Meaningful HTML without JavaScript",
  description: "Raw HTML should contain real content (SSR/SSG), not an empty shell",
  recommendation: "Ship server-rendered content; avoid empty #root shells for SEO-critical pages.",
  check: async ({ page }) => {
    if (page.wordCount >= 50) return pass(`Raw HTML has ${page.wordCount} words`);
    if (page.wordCount >= 20) return warn(`Raw HTML is thin (${page.wordCount} words)`);
    return fail(`Raw HTML looks like a JS shell (${page.wordCount} words)`, {
      wordCount: page.wordCount,
    });
  },
});

export const renderedContentRule = defineRule({
  id: "js-rendered-content",
  category: "js",
  severity: "critical",
  weight: 15,
  title: "Content not JS-only",
  description: "If raw HTML is empty but rendered DOM is rich, crawlers that skip JS miss content",
  recommendation: "SSR/prerender critical content so it exists in the initial HTML.",
  requiresRendering: true,
  check: async ({ page, renderedHtml }) => {
    if (!renderedHtml) return unmeasured("No rendered DOM");
    const diff = compareRawVsRendered(page.rawHtml, renderedHtml);
    if (diff.contentAppearsOnlyAfterJs) {
      return fail("Main content appears only after JavaScript", diff);
    }
    return pass("Content is present in raw HTML (or both are thin)", diff);
  },
});

export const titleModifiedRule = defineRule({
  id: "js-title-modified",
  category: "js",
  severity: "medium",
  weight: 8,
  title: "Title stable after render",
  description: "JS should not rewrite <title> to a different value",
  recommendation: "Set the correct title in the initial HTML.",
  requiresRendering: true,
  check: async ({ page, renderedHtml }) => {
    if (!renderedHtml) return unmeasured("No rendered DOM");
    const diff = compareRawVsRendered(page.rawHtml, renderedHtml);
    if (diff.titleChanged) {
      return warn("Title changed after JavaScript render", {
        raw: diff.rawTitle,
        rendered: diff.renderedTitle,
      });
    }
    return pass("Title unchanged after render");
  },
});

export const h1ModifiedRule = defineRule({
  id: "js-h1-modified",
  category: "js",
  severity: "medium",
  weight: 7,
  title: "H1 stable after render",
  description: "Primary H1 should not only exist (or change) after JS",
  recommendation: "Include the correct H1 in the server HTML.",
  requiresRendering: true,
  check: async ({ page, renderedHtml }) => {
    if (!renderedHtml) return unmeasured("No rendered DOM");
    const diff = compareRawVsRendered(page.rawHtml, renderedHtml);
    if (!diff.rawH1 && diff.renderedH1) {
      return fail("H1 only appears after JavaScript", diff);
    }
    if (diff.h1Changed) {
      return warn("H1 text changed after render", {
        raw: diff.rawH1,
        rendered: diff.renderedH1,
      });
    }
    return pass("H1 stable across raw/rendered DOM");
  },
});

export const descriptionModifiedRule = defineRule({
  id: "js-description-modified",
  category: "js",
  severity: "low",
  weight: 5,
  title: "Meta description stable after render",
  description: "Meta description should not be injected only by client JS",
  recommendation: "Put meta description in the initial <head>.",
  requiresRendering: true,
  check: async ({ page, renderedHtml }) => {
    if (!renderedHtml) return unmeasured("No rendered DOM");
    const diff = compareRawVsRendered(page.rawHtml, renderedHtml);
    if (!diff.rawDescription && diff.renderedDescription) {
      return warn("Meta description only appears after JS", diff);
    }
    if (diff.descriptionChanged) {
      return warn("Meta description changed after render", {
        raw: diff.rawDescription,
        rendered: diff.renderedDescription,
      });
    }
    return pass("Meta description stable");
  },
});

export const canonicalMismatchRule = defineRule({
  id: "js-canonical-mismatch",
  category: "js",
  severity: "high",
  weight: 10,
  title: "Canonical stable after render",
  description: "Canonical should not differ between raw HTML and rendered DOM",
  recommendation: "Emit the final canonical in the server HTML.",
  requiresRendering: true,
  check: async ({ page, renderedHtml }) => {
    if (!renderedHtml) return unmeasured("No rendered DOM");
    const diff = compareRawVsRendered(page.rawHtml, renderedHtml);
    if (diff.canonicalChanged) {
      return fail("Canonical differs between raw and rendered DOM", {
        raw: diff.rawCanonical,
        rendered: diff.renderedCanonical,
      });
    }
    return pass("Canonical consistent across render");
  },
});

export const renderedLinksRule = defineRule({
  id: "js-rendered-links",
  category: "js",
  severity: "medium",
  weight: 8,
  title: "Links not JS-only",
  description: "A large jump in link count after render means crawl discovery depends on JS",
  recommendation: "Include primary navigation links in the initial HTML.",
  requiresRendering: true,
  check: async ({ page, renderedHtml }) => {
    if (!renderedHtml) return unmeasured("No rendered DOM");
    const diff = compareRawVsRendered(page.rawHtml, renderedHtml);
    if (diff.rawLinkCount === 0 && diff.renderedLinkCount >= 5) {
      return fail("Links appear only after JavaScript", diff);
    }
    if (diff.renderedLinkCount > diff.rawLinkCount * 3 && diff.rawLinkCount < 5) {
      return warn("Most links appear only after render", diff);
    }
    return pass("Link discovery does not depend solely on JS", diff);
  },
});

export const consoleErrorsRule = defineRule({
  id: "js-console-errors",
  category: "js",
  severity: "medium",
  weight: 6,
  title: "No console errors during render",
  description: "JS errors during load can break rendering for users and bots",
  recommendation: "Fix pageerrors / console errors seen during Playwright render.",
  requiresRendering: true,
  check: async ({ page }) => {
    const errors = page.consoleErrors ?? [];
    if (errors.length === 0) return pass("No console errors during render");
    return warn(`${errors.length} console error(s) during render`, {
      samples: errors.slice(0, 5),
    });
  },
});

export const failedRequestsRule = defineRule({
  id: "js-failed-requests",
  category: "js",
  severity: "medium",
  weight: 7,
  title: "No failed subresource requests",
  description: "4xx/5xx or network failures for page assets during render",
  recommendation: "Fix broken script/style/font/XHR URLs loaded by the page.",
  requiresRendering: true,
  check: async ({ page }) => {
    const failed = page.failedRequests ?? [];
    if (failed.length === 0) return pass("No failed requests during render");
    return warn(`${failed.length} failed request(s) during render`, {
      samples: failed.slice(0, 8),
    });
  },
});

export const documentWriteRule = defineRule({
  id: "js-document-write",
  category: "js",
  severity: "medium",
  weight: 5,
  title: "Avoid document.write",
  description: "document.write is parser-blocking and fragile",
  recommendation: "Remove document.write; use modern DOM APIs.",
  check: async ({ page }) => {
    if (/document\.write\s*\(/i.test(page.rawHtml)) {
      return warn("document.write() found in page HTML/scripts");
    }
    return pass("No document.write detected in raw HTML");
  },
});

export const noindexMismatchRule = defineRule({
  id: "js-noindex-mismatch",
  category: "js",
  severity: "high",
  weight: 10,
  title: "noindex consistent after render",
  description: "Client JS should not inject/remove noindex differently from raw HTML",
  recommendation: "Keep robots directives in the initial HTML response.",
  requiresRendering: true,
  check: async ({ $, $rendered }) => {
    if (!$rendered) return unmeasured("No rendered DOM");
    const raw =
      ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const ren =
      ($rendered('meta[name="robots"]').attr("content") ?? "").toLowerCase();
    const rawNo = /\bnoindex\b/.test(raw);
    const renNo = /\bnoindex\b/.test(ren);
    if (rawNo !== renNo) {
      return fail("noindex differs between raw and rendered DOM", { raw, rendered: ren });
    }
    return pass("noindex consistent across render");
  },
});

const JS_RULES = [
  ssrCheckRule,
  renderedContentRule,
  titleModifiedRule,
  h1ModifiedRule,
  descriptionModifiedRule,
  canonicalMismatchRule,
  renderedLinksRule,
  consoleErrorsRule,
  failedRequestsRule,
  documentWriteRule,
  noindexMismatchRule,
];

export function registerJavascriptRules(): void {
  for (const rule of JS_RULES) registerRule(rule);
}

export { JS_RULES };
