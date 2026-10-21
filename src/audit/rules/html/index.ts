import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

export const doctypeRule = defineRule({
  id: "htmlval-missing-doctype",
  category: "html",
  severity: "medium",
  weight: 10,
  title: "HTML doctype present",
  description: "Documents should start with <!DOCTYPE html>",
  recommendation: "Add <!DOCTYPE html> as the first line.",
  check: async ({ rawHtml }) => {
    if (/^\s*<!doctype\s+html/i.test(rawHtml)) return pass("Doctype present");
    return fail("Missing <!DOCTYPE html>");
  },
});

export const charsetRule = defineRule({
  id: "htmlval-missing-charset",
  category: "html",
  severity: "high",
  weight: 12,
  title: "Charset declared",
  description: "UTF-8 charset should be declared early in <head>",
  recommendation: 'Add <meta charset="utf-8"> early in <head>.',
  check: async ({ $, rawHtml, response }) => {
    const meta = $('meta[charset]').attr("charset");
    const httpEquiv = $('meta[http-equiv="content-type" i]').attr("content");
    const headerCt =
      Object.entries(response.headers).find(
        ([k]) => k.toLowerCase() === "content-type",
      )?.[1] ?? "";
    if (meta || /charset=/i.test(httpEquiv ?? "") || /charset=/i.test(headerCt)) {
      return pass("Charset declared", { meta, headerCt });
    }
    // also accept BOM-less html with charset in first 1024 bytes of raw
    if (/<meta[^>]+charset=/i.test(rawHtml.slice(0, 2048))) {
      return pass("Charset meta found in early HTML");
    }
    return fail("No charset declaration found");
  },
});

export const multipleTitlesRule = defineRule({
  id: "htmlval-multiple-titles",
  category: "html",
  severity: "medium",
  weight: 8,
  title: "Single <title>",
  description: "Documents must have exactly one title",
  recommendation: "Keep exactly one <title> in <head>.",
  check: async ({ $ }) => {
    const n = $("title").length;
    if (n === 1) return pass("Single title");
    if (n === 0) return pass("No title — covered by core rules");
    return fail(`${n} <title> elements found`);
  },
});

export const multipleDescriptionsRule = defineRule({
  id: "htmlval-multiple-descriptions",
  category: "html",
  severity: "medium",
  weight: 7,
  title: "Single meta description",
  description: "Only one meta description should exist",
  recommendation: "Keep a single <meta name=\"description\">.",
  check: async ({ $ }) => {
    const n = $('meta[name="description" i]').length;
    if (n <= 1) return pass(n === 1 ? "Single meta description" : "No meta description");
    return fail(`${n} meta description tags`);
  },
});

export const multipleHeadsRule = defineRule({
  id: "htmlval-multiple-heads",
  category: "html",
  severity: "high",
  weight: 10,
  title: "Single <head>",
  description: "HTML documents must have exactly one head",
  recommendation: "Remove duplicate <head> elements.",
  check: async ({ $ }) => {
    const n = $("head").length;
    if (n <= 1) return pass("Single head");
    return fail(`${n} <head> elements`);
  },
});

export const titleOutsideHeadRule = defineRule({
  id: "htmlval-title-outside-head",
  category: "html",
  severity: "medium",
  weight: 8,
  title: "Title inside <head>",
  description: "Titles outside head may be ignored",
  recommendation: "Move <title> into <head>.",
  check: async ({ $ }) => {
    const outside = $("body title, html > title").length;
    // cheerio may nest oddly; also check titles not under head
    const all = $("title").toArray();
    const bad = all.filter((el) => $(el).closest("head").length === 0);
    if (bad.length === 0 && outside === 0) return pass("Title is in head");
    if (bad.length === 0) return pass("Title placement OK");
    return warn(`${bad.length} <title> outside <head>`);
  },
});

export const loremIpsumRule = defineRule({
  id: "htmlval-lorem-ipsum",
  category: "html",
  severity: "high",
  weight: 9,
  title: "No lorem ipsum",
  description: "Placeholder Latin text must not ship",
  recommendation: 'Replace "Lorem ipsum" with real content.',
  check: async ({ $ }) => {
    const text = $("body").text().toLowerCase();
    if (text.includes("lorem ipsum")) return fail("Lorem ipsum placeholder found");
    return pass("No lorem ipsum");
  },
});

export const sizeLimitRule = defineRule({
  id: "htmlval-size-limit",
  category: "html",
  severity: "medium",
  weight: 6,
  title: "HTML size under 5MB",
  description: "Huge HTML slows parsing and may truncate indexing",
  recommendation: "Keep HTML document size below 5MB.",
  check: async ({ rawHtml }) => {
    const bytes = Buffer.byteLength(rawHtml, "utf8");
    if (bytes < 1_500_000) return pass(`HTML ${(bytes / 1024).toFixed(0)} KB`);
    if (bytes < 5_000_000) {
      return warn(`Large HTML (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
    }
    return fail(`HTML exceeds 5MB (${(bytes / 1024 / 1024).toFixed(2)} MB)`);
  },
});

export const baseUrlRule = defineRule({
  id: "htmlval-base-url",
  category: "html",
  severity: "medium",
  weight: 5,
  title: "Valid <base> usage",
  description: "At most one base element with a usable href",
  recommendation: "Use at most one <base> with a valid href.",
  check: async ({ $ }) => {
    const bases = $("base");
    if (bases.length === 0) return pass("No <base> element");
    if (bases.length > 1) return fail(`${bases.length} <base> elements`);
    const href = bases.first().attr("href") ?? "";
    if (!href.trim()) return warn("<base> missing href");
    return pass(`<base href="${href}">`);
  },
});

export const invalidHeadRule = defineRule({
  id: "htmlval-invalid-head",
  category: "html",
  severity: "low",
  weight: 4,
  title: "Head contains metadata only",
  description: "Non-metadata elements in head can confuse parsers",
  recommendation: "Keep only meta, link, title, style, script, base, noscript, template in head.",
  check: async ({ $ }) => {
    const allowed = new Set([
      "meta",
      "link",
      "title",
      "style",
      "script",
      "base",
      "noscript",
      "template",
    ]);
    const bad: string[] = [];
    $("head > *").each((_, el) => {
      const tag = ($(el).prop("tagName") as string | undefined)?.toLowerCase();
      if (tag && !allowed.has(tag)) bad.push(tag);
    });
    if (bad.length === 0) return pass("Head children look valid");
    return warn(`Unexpected head children: ${Array.from(new Set(bad)).join(", ")}`);
  },
});

const HTML_RULES = [
  doctypeRule,
  charsetRule,
  multipleTitlesRule,
  multipleDescriptionsRule,
  multipleHeadsRule,
  titleOutsideHeadRule,
  loremIpsumRule,
  sizeLimitRule,
  baseUrlRule,
  invalidHeadRule,
];

export function registerHtmlRules(): void {
  for (const rule of HTML_RULES) registerRule(rule);
}

export { HTML_RULES };
