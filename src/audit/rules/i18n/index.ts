import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

const LANG_RE = /^(x-default|[a-z]{2,3}(-[a-zA-Z0-9]{2,8})*)$/;

function hreflangTags($: import("cheerio").CheerioAPI) {
  const tags: Array<{ lang: string; href: string }> = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    tags.push({
      lang: ($(el).attr("hreflang") ?? "").trim(),
      href: ($(el).attr("href") ?? "").trim(),
    });
  });
  return tags;
}

export const langAttributeRule = defineRule({
  id: "i18n-lang-attribute",
  category: "i18n",
  severity: "high",
  weight: 15,
  title: "html lang attribute",
  description: "Document language should be declared on <html>",
  recommendation: 'Add lang attribute to <html>: <html lang="en">.',
  check: async ({ $ }) => {
    const lang = $("html").attr("lang")?.trim();
    if (!lang) return fail("Missing html lang attribute");
    if (!LANG_RE.test(lang) && lang.toLowerCase() !== "x-default") {
      return warn(`Unusual lang value "${lang}"`);
    }
    return pass(`html lang="${lang}"`);
  },
});

export const hreflangRule = defineRule({
  id: "i18n-hreflang",
  category: "i18n",
  severity: "medium",
  weight: 10,
  title: "Hreflang annotations valid when present",
  description: "Hreflang values and hrefs must be well-formed",
  recommendation: "Add valid hreflang alternate links with absolute hrefs.",
  check: async ({ $ }) => {
    const tags = hreflangTags($);
    if (tags.length === 0) return pass("No hreflang (OK if monolingual)");
    const badLang = tags.filter((t) => !LANG_RE.test(t.lang));
    if (badLang.length > 0) {
      return fail(`${badLang.length} invalid hreflang code(s)`, {
        samples: badLang.slice(0, 5),
      });
    }
    return pass(`${tags.length} hreflang annotation(s)`);
  },
});

export const hreflangAbsoluteRule = defineRule({
  id: "i18n-hreflang-relative-url",
  category: "i18n",
  severity: "high",
  weight: 10,
  title: "Hreflang hrefs are absolute",
  description: "Relative hreflang URLs are invalid",
  recommendation: "Use absolute URLs in hreflang annotations.",
  check: async ({ $ }) => {
    const tags = hreflangTags($);
    if (tags.length === 0) return pass("No hreflang");
    const relative = tags.filter((t) => t.href && !/^https?:\/\//i.test(t.href));
    if (relative.length === 0) return pass("Hreflang hrefs are absolute");
    return fail(`${relative.length} relative hreflang href(s)`, {
      samples: relative.slice(0, 5),
    });
  },
});

export const hreflangXDefaultRule = defineRule({
  id: "i18n-hreflang-x-default",
  category: "i18n",
  severity: "low",
  weight: 5,
  title: "x-default when hreflang set",
  description: "Multilingual clusters should include x-default",
  recommendation: "Add hreflang=\"x-default\" as the language fallback.",
  check: async ({ $ }) => {
    const tags = hreflangTags($);
    if (tags.length < 2) return pass("Hreflang cluster small / absent");
    const has = tags.some((t) => t.lang.toLowerCase() === "x-default");
    if (has) return pass("x-default present");
    return warn("Hreflang set without x-default");
  },
});

export const hreflangSelfReferenceRule = defineRule({
  id: "i18n-hreflang-return-links",
  category: "i18n",
  severity: "medium",
  weight: 8,
  title: "Hreflang includes self-reference",
  description: "Each page in a cluster should list itself",
  recommendation: "Include a self-referencing hreflang on every alternate page.",
  check: async ({ $, page }) => {
    const tags = hreflangTags($);
    if (tags.length === 0) return pass("No hreflang");
    const self = tags.some((t) => {
      try {
        return new URL(t.href).href.replace(/\/$/, "") ===
          new URL(page.finalUrl).href.replace(/\/$/, "");
      } catch {
        return t.href === page.finalUrl;
      }
    });
    if (self) return pass("Self-referencing hreflang present");
    return warn("Hreflang cluster missing self-reference");
  },
});

export const hreflangConflictingRule = defineRule({
  id: "i18n-hreflang-conflicting",
  category: "i18n",
  severity: "medium",
  weight: 7,
  title: "No conflicting hreflang codes",
  description: "Each language code should map to one href on the page",
  recommendation: "Resolve duplicate hreflang language codes.",
  check: async ({ $ }) => {
    const tags = hreflangTags($);
    if (tags.length === 0) return pass("No hreflang");
    const byLang = new Map<string, Set<string>>();
    for (const t of tags) {
      const set = byLang.get(t.lang.toLowerCase()) ?? new Set();
      set.add(t.href);
      byLang.set(t.lang.toLowerCase(), set);
    }
    const conflicts = Array.from(byLang.entries()).filter(([, hrefs]) => hrefs.size > 1);
    if (conflicts.length === 0) return pass("No conflicting hreflang codes");
    return warn(`${conflicts.length} conflicting hreflang code(s)`, {
      samples: conflicts.slice(0, 5).map(([lang, hrefs]) => ({
        lang,
        hrefs: Array.from(hrefs),
      })),
    });
  },
});

const I18N_RULES = [
  langAttributeRule,
  hreflangRule,
  hreflangAbsoluteRule,
  hreflangXDefaultRule,
  hreflangSelfReferenceRule,
  hreflangConflictingRule,
];

export function registerI18nRules(): void {
  for (const rule of I18N_RULES) registerRule(rule);
}

export { I18N_RULES };
