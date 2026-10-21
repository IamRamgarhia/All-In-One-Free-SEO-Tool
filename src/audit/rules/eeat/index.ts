import { defineRule, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

function linkMatches(
  $: import("cheerio").CheerioAPI,
  patterns: RegExp[],
): boolean {
  let found = false;
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").toLowerCase();
    const text = $(el).text().toLowerCase();
    if (patterns.some((p) => p.test(href) || p.test(text))) found = true;
  });
  return found;
}

export const aboutPageRule = defineRule({
  id: "eeat-about-page",
  category: "eeat",
  severity: "medium",
  weight: 10,
  title: "About page linked",
  description: "Trustworthy sites expose who they are",
  recommendation: "Add an About / About Us page and link it sitewide.",
  check: async ({ $ }) => {
    const ok = linkMatches($, [
      /\/about\/?/,
      /\/a-propos/,
      /about[_-]?us/,
      /\babout us\b/,
      /\bà propos\b/,
      /\bqui sommes/,
    ]);
    if (ok) return pass("About-style link found");
    return warn("No About page link detected");
  },
});

export const contactPageRule = defineRule({
  id: "eeat-contact-page",
  category: "eeat",
  severity: "medium",
  weight: 10,
  title: "Contact page linked",
  description: "Users and Google expect a clear contact path",
  recommendation: "Add a contact page with email, phone, form, and/or address.",
  check: async ({ $ }) => {
    const ok = linkMatches($, [/\/contact/, /\bcontact\b/, /nous-contacter/]);
    if (ok) return pass("Contact link found");
    return warn("No Contact page link detected");
  },
});

export const privacyPolicyRule = defineRule({
  id: "eeat-privacy-policy",
  category: "eeat",
  severity: "high",
  weight: 12,
  title: "Privacy policy linked",
  description: "Privacy policy is a baseline trust / legal signal",
  recommendation: "Link a privacy policy from the footer on every page.",
  check: async ({ $ }) => {
    const ok = linkMatches($, [
      /privacy/,
      /confidentialit/,
      /politique-de-confidentialite/,
      /datenschutz/,
    ]);
    if (ok) return pass("Privacy policy link found");
    return warn("No privacy policy link detected");
  },
});

export const termsOfServiceRule = defineRule({
  id: "eeat-terms-of-service",
  category: "eeat",
  severity: "low",
  weight: 5,
  title: "Terms of service linked",
  description: "ToS helps for commerce / SaaS / UGC trust",
  recommendation: "Add ToS link in footer for commerce/SaaS sites.",
  check: async ({ $ }) => {
    const ok = linkMatches($, [
      /terms/,
      /conditions/,
      /cgu/,
      /cgv/,
      /mentions-legales/,
      /legal/,
    ]);
    if (ok) return pass("Terms / legal link found");
    return warn("No terms / legal link detected");
  },
});

export const authorBylineRule = defineRule({
  id: "eeat-author-byline",
  category: "eeat",
  severity: "low",
  weight: 6,
  title: "Author byline when article-like",
  description: "Articles should attribute an author",
  recommendation: "Add author name + link to author page on articles.",
  check: async ({ $ }) => {
    const article = $("article").length > 0;
    const byline =
      $('[rel="author"], .author, .byline, [itemprop="author"]').length > 0 ||
      /by\s+[A-Z][a-z]+/.test($("body").text().slice(0, 2000));
    if (!article) {
      return byline ? pass("Author signal present") : pass("Author optional (no article)");
    }
    if (byline) return pass("Author byline present");
    return warn("Article without clear author byline");
  },
});

export const contentDatesRule = defineRule({
  id: "eeat-content-dates",
  category: "eeat",
  severity: "low",
  weight: 5,
  title: "Visible or schema dates",
  description: "Freshness signals via <time> or Article dates",
  recommendation: "Add datePublished / dateModified or <time> elements.",
  check: async ({ $ }) => {
    const time = $("time[datetime]").length;
    const ld = $('script[type="application/ld+json"]').text();
    const schemaDate = /datePublished|dateModified/i.test(ld);
    if (time > 0 || schemaDate) return pass("Date signals present");
    return warn("No visible <time> or schema dates");
  },
});

export const physicalAddressRule = defineRule({
  id: "eeat-physical-address",
  category: "eeat",
  severity: "info",
  weight: 3,
  title: "Physical address / NAP hints",
  description: "Local businesses benefit from a visible address",
  recommendation: "Publish a PostalAddress in schema and visible NAP.",
  check: async ({ $ }) => {
    const text = $("body").text();
    const hasPostal =
      /\b\d{5}\b/.test(text) ||
      $('[itemprop="address"],[itemtype*="PostalAddress"]').length > 0 ||
      /PostalAddress/i.test($('script[type="application/ld+json"]').text());
    if (hasPostal) return pass("Address-like signal found");
    return pass("No local address detected (OK if not local)");
  },
});

export const trustSignalsRule = defineRule({
  id: "eeat-trust-signals",
  category: "eeat",
  severity: "info",
  weight: 3,
  title: "Trust signal heuristics",
  description: "Reviews, badges, or media mentions support trust",
  recommendation: "Add reviews, certifications, or press mentions where relevant.",
  check: async ({ $ }) => {
    const text = $("body").text().toLowerCase();
    const hits = [
      "review",
      "avis",
      "testimonial",
      "certif",
      "badge",
      "as seen in",
      "trustpilot",
      "google rating",
    ].filter((k) => text.includes(k));
    if (hits.length >= 2) return pass(`Trust cues: ${hits.slice(0, 4).join(", ")}`);
    return warn("Few on-page trust signals detected");
  },
});

const EEAT_RULES = [
  aboutPageRule,
  contactPageRule,
  privacyPolicyRule,
  termsOfServiceRule,
  authorBylineRule,
  contentDatesRule,
  physicalAddressRule,
  trustSignalsRule,
];

export function registerEeatRules(): void {
  for (const rule of EEAT_RULES) registerRule(rule);
}

export { EEAT_RULES };
