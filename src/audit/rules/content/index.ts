import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

function bodyText($: import("cheerio").CheerioAPI): string {
  $("script,style,noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export const wordCountRule = defineRule({
  id: "content-word-count",
  category: "content",
  severity: "high",
  weight: 15,
  title: "Sufficient word count",
  description: "Informational pages should have enough unique text",
  recommendation: "Expand thin content to at least 300 words for informational pages.",
  check: async ({ page }) => {
    if (page.wordCount >= 300) return pass(`${page.wordCount} words`);
    if (page.wordCount >= 100) {
      return warn(`Thin content (${page.wordCount} words)`, { wordCount: page.wordCount });
    }
    return fail(`Very thin content (${page.wordCount} words)`, {
      wordCount: page.wordCount,
    });
  },
});

export const headingHierarchyRule = defineRule({
  id: "content-heading-hierarchy",
  category: "content",
  severity: "medium",
  weight: 10,
  title: "Heading hierarchy",
  description: "Headings should not skip levels (H1→H2→H3)",
  recommendation: "Maintain proper heading order; never skip levels.",
  check: async ({ $ }) => {
    const levels: number[] = [];
    $("h1,h2,h3,h4,h5,h6").each((_, el) => {
      const tag = ($(el).prop("tagName") as string | undefined)?.toLowerCase();
      if (tag) levels.push(Number(tag.slice(1)));
    });
    if (levels.length === 0) return warn("No headings found");
    for (let i = 1; i < levels.length; i++) {
      if (levels[i]! > levels[i - 1]! + 1) {
        return warn(`Heading skip H${levels[i - 1]} → H${levels[i]}`, { levels });
      }
    }
    return pass("Heading hierarchy looks sequential");
  },
});

export const titleSameAsH1Rule = defineRule({
  id: "content-title-same-as-h1",
  category: "content",
  severity: "low",
  weight: 5,
  title: "Title differs from H1",
  description: "Title tag and H1 should not be identical",
  recommendation: "Differentiate title from H1; use title for SERP and H1 for page context.",
  check: async ({ page }) => {
    const title = (page.title ?? "").trim().toLowerCase();
    const h1 = (page.h1s[0] ?? "").trim().toLowerCase();
    if (!title || !h1) return pass("Title or H1 missing — covered by core rules");
    if (title === h1) return warn("Title and H1 are identical");
    return pass("Title and H1 differ");
  },
});

export const titleSameAsDescriptionRule = defineRule({
  id: "content-title-same-as-description",
  category: "content",
  severity: "medium",
  weight: 6,
  title: "Title differs from meta description",
  description: "Meta description should expand on the title, not copy it",
  recommendation: "Write a distinct meta description that encourages clicks.",
  check: async ({ page }) => {
    const title = (page.title ?? "").trim().toLowerCase();
    const desc = (page.metaDescription ?? "").trim().toLowerCase();
    if (!title || !desc) return pass("Title or description missing");
    if (title === desc) return fail("Title and meta description are identical");
    return pass("Title and description differ");
  },
});

export const textHtmlRatioRule = defineRule({
  id: "content-text-html-ratio",
  category: "content",
  severity: "low",
  weight: 6,
  title: "Text-to-HTML ratio",
  description: "Pages dominated by markup may look thin to crawlers",
  recommendation: "Increase text-to-HTML ratio; reduce unnecessary markup.",
  check: async ({ page, rawHtml }) => {
    const htmlLen = rawHtml.length || 1;
    const textLen = page.wordCount * 5; // rough chars
    const ratio = textLen / htmlLen;
    if (ratio >= 0.1) return pass(`Text/HTML ratio ~${(ratio * 100).toFixed(1)}%`);
    if (ratio >= 0.04) return warn(`Low text/HTML ratio (~${(ratio * 100).toFixed(1)}%)`);
    return fail(`Very low text/HTML ratio (~${(ratio * 100).toFixed(1)}%)`);
  },
});

export const placeholderTextRule = defineRule({
  id: "content-placeholder-text",
  category: "content",
  severity: "high",
  weight: 10,
  title: "No placeholder / TODO text",
  description: "Visible TODO, FIXME, or lorem ipsum signals unfinished pages",
  recommendation: "Remove placeholder and TODO notes from visible content.",
  check: async ({ $ }) => {
    const text = bodyText($).toLowerCase();
    const hits = ["lorem ipsum", "todo:", "fixme", "placeholder text", "coming soon"].filter(
      (p) => text.includes(p),
    );
    if (hits.length === 0) return pass("No placeholder text detected");
    return fail(`Placeholder signals: ${hits.join(", ")}`, { hits });
  },
});

export const metaInBodyRule = defineRule({
  id: "content-meta-in-body",
  category: "content",
  severity: "medium",
  weight: 7,
  title: "Meta tags stay in <head>",
  description: "Meta tags in <body> are often ignored",
  recommendation: "Move all <meta> tags from <body> to <head>.",
  check: async ({ $ }) => {
    const n = $("body meta").length;
    if (n === 0) return pass("No meta tags in body");
    return warn(`${n} meta tag(s) found in <body>`);
  },
});

export const articleLinksRule = defineRule({
  id: "content-article-links",
  category: "content",
  severity: "low",
  weight: 5,
  title: "Content has links",
  description: "Content pages benefit from internal/external references",
  recommendation: "Add relevant internal and external links within content.",
  check: async ({ page }) => {
    if (page.wordCount < 100) return pass("Short page — link density N/A");
    if (page.links.length >= 2) return pass(`${page.links.length} links on page`);
    return warn("Few or no links in page content", { linkCount: page.links.length });
  },
});

export const staleCopyrightRule = defineRule({
  id: "content-stale-copyright",
  category: "content",
  severity: "low",
  weight: 4,
  title: "Copyright year current",
  description: "Footer copyright should reflect the current year",
  recommendation: "Update the footer copyright year to the current year.",
  check: async ({ $ }) => {
    const year = new Date().getFullYear();
    const text = bodyText($);
    const matches = text.match(/©\s*(20\d{2})|copyright\s+(20\d{2})/gi) ?? [];
    if (matches.length === 0) return pass("No copyright year detected");
    const years = matches
      .map((m) => Number((m.match(/20\d{2}/) ?? [])[0]))
      .filter((y) => Number.isFinite(y));
    const stale = years.filter((y) => y < year - 1);
    if (stale.length > 0) {
      return warn(`Stale copyright year(s): ${stale.join(", ")}`, { year, stale });
    }
    return pass("Copyright year looks current");
  },
});

export const unrenderedMarkupRule = defineRule({
  id: "content-unrendered-markup",
  category: "content",
  severity: "medium",
  weight: 6,
  title: "No raw Markdown in HTML",
  description: "Literal Markdown syntax in visible text is a publishing bug",
  recommendation: "Render Markdown to HTML before publishing.",
  check: async ({ $ }) => {
    const text = bodyText($);
    const mdHits =
      (text.match(/\*\*[^*\n]{2,40}\*\*/g)?.length ?? 0) +
      (text.match(/\[[^\]]+\]\([^)]+\)/g)?.length ?? 0);
    if (mdHits >= 3) return warn(`Possible unrendered Markdown (${mdHits} hits)`);
    return pass("No obvious raw Markdown");
  },
});

export const headingLengthRule = defineRule({
  id: "content-heading-length",
  category: "content",
  severity: "low",
  weight: 4,
  title: "Heading length",
  description: "Headings should stay concise",
  recommendation: "Keep headings under ~70 characters.",
  check: async ({ $ }) => {
    const long: string[] = [];
    $("h1,h2,h3").each((_, el) => {
      const t = $(el).text().trim();
      if (t.length > 90) long.push(t.slice(0, 80));
    });
    if (long.length === 0) return pass("Headings are reasonably short");
    return warn(`${long.length} long heading(s)`, { samples: long.slice(0, 3) });
  },
});

export const hiddenTextRule = defineRule({
  id: "content-hidden-text",
  category: "content",
  severity: "high",
  weight: 8,
  title: "No large hidden text blocks",
  description: "Long text hidden via inline display:none/visibility:hidden looks spammy",
  recommendation: "Remove long hidden text; use sr-only for accessibility-only copy.",
  check: async ({ $ }) => {
    let suspicious = 0;
    $("[style]").each((_, el) => {
      const style = ($(el).attr("style") ?? "").toLowerCase();
      const hidden =
        /display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style);
      if (!hidden) return;
      const len = $(el).text().replace(/\s+/g, " ").trim().length;
      if (len >= 200) suspicious += 1;
    });
    if (suspicious === 0) return pass("No large hidden text blocks");
    return fail(`${suspicious} large hidden text block(s)`);
  },
});

const CONTENT_RULES = [
  wordCountRule,
  headingHierarchyRule,
  titleSameAsH1Rule,
  titleSameAsDescriptionRule,
  textHtmlRatioRule,
  placeholderTextRule,
  metaInBodyRule,
  articleLinksRule,
  staleCopyrightRule,
  unrenderedMarkupRule,
  headingLengthRule,
  hiddenTextRule,
];

export function registerContentRules(): void {
  for (const rule of CONTENT_RULES) registerRule(rule);
}

export { CONTENT_RULES };
