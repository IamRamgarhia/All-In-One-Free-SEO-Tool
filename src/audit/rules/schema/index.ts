import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

type JsonLd = Record<string, unknown>;

function parseJsonLd($: import("cheerio").CheerioAPI): {
  blocks: JsonLd[];
  errors: string[];
} {
  const blocks: JsonLd[] = [];
  const errors: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === "object") blocks.push(item as JsonLd);
        }
      } else if (parsed && typeof parsed === "object") {
        blocks.push(parsed as JsonLd);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "parse error");
    }
  });
  return { blocks, errors };
}

function typesOf(block: JsonLd): string[] {
  const t = block["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  const graph = block["@graph"];
  if (Array.isArray(graph)) {
    return graph.flatMap((g) =>
      g && typeof g === "object" ? typesOf(g as JsonLd) : [],
    );
  }
  return [];
}

function allTypes(blocks: JsonLd[]): string[] {
  return blocks.flatMap(typesOf);
}

export const schemaPresentRule = defineRule({
  id: "schema-present",
  category: "schema",
  severity: "medium",
  weight: 12,
  title: "Structured data present",
  description: "JSON-LD helps rich results and entity understanding",
  recommendation: "Add JSON-LD structured data for rich search results.",
  check: async ({ $ }) => {
    const { blocks } = parseJsonLd($);
    if (blocks.length === 0) return warn("No JSON-LD structured data found");
    return pass(`${blocks.length} JSON-LD block(s)`, {
      types: allTypes(blocks).slice(0, 12),
    });
  },
});

export const schemaValidRule = defineRule({
  id: "schema-valid",
  category: "schema",
  severity: "high",
  weight: 14,
  title: "JSON-LD parses",
  description: "Invalid JSON-LD is ignored by Google",
  recommendation: "Fix JSON-LD syntax errors using Google Rich Results Test.",
  check: async ({ $ }) => {
    const { blocks, errors } = parseJsonLd($);
    if (errors.length > 0) {
      return fail(`${errors.length} invalid JSON-LD block(s)`, {
        samples: errors.slice(0, 3),
      });
    }
    if (blocks.length === 0) return pass("No JSON-LD to validate");
    return pass("All JSON-LD blocks parse");
  },
});

export const schemaOrganizationRule = defineRule({
  id: "schema-organization",
  category: "schema",
  severity: "low",
  weight: 6,
  title: "Organization schema",
  description: "Organization / LocalBusiness helps brand entity signals",
  recommendation: "Add Organization schema with name, logo, url, and sameAs.",
  check: async ({ $, site }) => {
    const types = allTypes(parseJsonLd($).blocks).map((t) => t.toLowerCase());
    const has = types.some(
      (t) =>
        t === "organization" ||
        t.includes("localbusiness") ||
        t === "corporation",
    );
    // Homepage-oriented soft check
    try {
      const path = new URL(site.url).pathname;
      if (path !== "/" && path !== "") {
        return has
          ? pass("Organization-like schema present")
          : pass("Organization schema optional off-homepage");
      }
    } catch {
      /* ignore */
    }
    if (has) return pass("Organization / LocalBusiness schema present");
    return warn("No Organization / LocalBusiness schema on homepage");
  },
});

export const schemaBreadcrumbRule = defineRule({
  id: "schema-breadcrumb",
  category: "schema",
  severity: "low",
  weight: 5,
  title: "BreadcrumbList schema",
  description: "BreadcrumbList can power SERP breadcrumb trails",
  recommendation: "Add BreadcrumbList schema with itemListElement.",
  check: async ({ $, page }) => {
    const types = allTypes(parseJsonLd($).blocks).map((t) => t.toLowerCase());
    const has = types.some((t) => t === "breadcrumblist");
    const depth = page.depth ?? 0;
    if (depth < 1 && !has) return pass("Breadcrumbs optional on shallow pages");
    if (has) return pass("BreadcrumbList present");
    if (depth >= 2) return warn("Deep page without BreadcrumbList schema");
    return pass("No BreadcrumbList (optional)");
  },
});

export const schemaArticleRule = defineRule({
  id: "schema-article",
  category: "schema",
  severity: "low",
  weight: 5,
  title: "Article schema when article-like",
  description: "Pages with article markup benefit from Article JSON-LD",
  recommendation: "Add Article schema with headline, author, datePublished, image.",
  check: async ({ $ }) => {
    const hasArticleEl = $("article").length > 0;
    const types = allTypes(parseJsonLd($).blocks).map((t) => t.toLowerCase());
    const hasSchema = types.some(
      (t) => t === "article" || t === "newsarticle" || t === "blogposting",
    );
    if (!hasArticleEl) {
      return hasSchema
        ? pass("Article schema present")
        : pass("No article element — Article schema optional");
    }
    if (hasSchema) return pass("Article schema matches <article>");
    return warn("<article> present without Article JSON-LD");
  },
});

export const schemaFaqRule = defineRule({
  id: "schema-faq",
  category: "schema",
  severity: "info",
  weight: 3,
  title: "FAQPage schema when FAQ markup exists",
  description: "FAQ sections can qualify for FAQ rich results",
  recommendation: "Add FAQPage schema with Question / acceptedAnswer pairs.",
  check: async ({ $ }) => {
    const text = $("body").text().toLowerCase();
    const looksFaq =
      $('[itemtype*="FAQPage"]').length > 0 ||
      (text.includes("frequently asked") && $("details, .faq, #faq").length > 0);
    const types = allTypes(parseJsonLd($).blocks).map((t) => t.toLowerCase());
    const has = types.includes("faqpage");
    if (!looksFaq) {
      return has ? pass("FAQPage schema present") : pass("No FAQ section detected");
    }
    if (has) return pass("FAQPage schema present");
    return warn("FAQ-like content without FAQPage schema");
  },
});

export const schemaWebsiteSearchRule = defineRule({
  id: "schema-website-search",
  category: "schema",
  severity: "info",
  weight: 3,
  title: "WebSite SearchAction (sitelinks searchbox)",
  description: "WebSite + SearchAction can enable sitelinks searchbox",
  recommendation: "Add WebSite schema with potentialAction SearchAction.",
  check: async ({ $ }) => {
    const { blocks } = parseJsonLd($);
    const raw = JSON.stringify(blocks);
    if (/SearchAction/i.test(raw)) return pass("SearchAction present");
    const types = allTypes(blocks).map((t) => t.toLowerCase());
    if (types.includes("website")) {
      return warn("WebSite schema without SearchAction");
    }
    return pass("WebSite SearchAction optional");
  },
});

export const schemaTypeRule = defineRule({
  id: "schema-type",
  category: "schema",
  severity: "low",
  weight: 4,
  title: "Recognizable schema @type",
  description: "JSON-LD should declare a known schema.org @type",
  recommendation: "Use appropriate schema type (Article, Product, LocalBusiness, etc.).",
  check: async ({ $ }) => {
    const { blocks } = parseJsonLd($);
    if (blocks.length === 0) return pass("No schema");
    const types = allTypes(blocks);
    if (types.length === 0) return warn("JSON-LD blocks missing @type");
    return pass(`Types: ${types.slice(0, 8).join(", ")}`, { types });
  },
});

const SCHEMA_RULES = [
  schemaPresentRule,
  schemaValidRule,
  schemaOrganizationRule,
  schemaBreadcrumbRule,
  schemaArticleRule,
  schemaFaqRule,
  schemaWebsiteSearchRule,
  schemaTypeRule,
];

export function registerSchemaRules(): void {
  for (const rule of SCHEMA_RULES) registerRule(rule);
}

export { SCHEMA_RULES };
