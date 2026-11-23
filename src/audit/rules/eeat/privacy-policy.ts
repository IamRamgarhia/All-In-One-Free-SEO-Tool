import type { CheerioAPI, Element } from "cheerio";
import { defineRule, pass } from "@/audit/engine/define-rule";

export const PRIVACY_PATTERNS = {
  // Link text patterns (case insensitive)
  linkText: [
    /privacy\s*policy/i,
    /privacy\s*notice/i,
    /privacy\s*statement/i,
    /data\s*protection/i,
    /datenschutz/i,
    // German
    /politique\s*de\s*confidentialit/i,
    // French. A French site usually covers personal data in its "mentions
    // légales" (the legal notice the law requires), or on a page named after
    // the GDPR: the rule read nd-prestige.com's /mentions-legales, which
    // covers personal data and cookies, as "no privacy policy".
    /mentions\s*l[eé]gales/i,
    /donn[eé]es\s*personnelles/i,
    /protection\s*des\s*donn[eé]es/i,
    /confidentialit[eé]/i,
    /\bRGPD\b/i,
    /politica\s*de\s*privacidad/i,
    // Spanish
    /informativa\s*privacy/i
    // Italian
  ],
  // URL path patterns
  urlPaths: [
    /\/privacy[-_]?policy/i,
    /\/privacy[-_]?notice/i,
    /\/privacy\/?$/i,
    /\/legal\/privacy/i,
    /\/data[-_]?protection/i,
    /\/datenschutz/i,
    /\/mentions[-_]?legales/i,
    /\/confidentialite/i,
    /\/politique[-_]de[-_]confidentialite/i,
    /\/donnees[-_]personnelles/i,
    /\/rgpd\/?$/i
  ],
  // Common privacy policy URLs
  urls: [
    "privacy-policy",
    "privacy_policy",
    "privacypolicy",
    "privacy",
    "legal/privacy",
    "policies/privacy",
    "data-protection"
  ]
};
export const privacyPolicyRule = defineRule({
  id: "eeat-privacy-policy",
  name: "Privacy Policy",
  description: "Checks for privacy policy page linked from footer",
  category: "eeat",
  weight: 8,
  run(context) {
    const { $ } = context;
    // The privacy page itself: it need not link to itself. nd-prestige.com's
    // /mentions-legales was the one page still warned for "no privacy link".
    let ownPath = "";
    try {
      ownPath = new URL(context.url).pathname;
    } catch {
      ownPath = "";
    }
    if (PRIVACY_PATTERNS.urlPaths.some((p) => p.test(ownPath))) {
      return pass("eeat-privacy-policy", "This page is the privacy page", { url: context.url });
    }
    const foundLinks: { href: string; text: string; location: string; }[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      const ariaLabel = $(el).attr("aria-label") || "";
      const title = $(el).attr("title") || "";
      const combinedText = `${text} ${ariaLabel} ${title}`;
      for (const pattern of PRIVACY_PATTERNS.linkText) {
        if (pattern.test(combinedText)) {
          const location = detectLocation3($, el);
          foundLinks.push({ href, text: text.slice(0, 50), location });
          return;
        }
      }
      for (const pattern of PRIVACY_PATTERNS.urlPaths) {
        if (pattern.test(href)) {
          const location = detectLocation3($, el);
          foundLinks.push({ href, text: text.slice(0, 50), location });
          return;
        }
      }
      const hrefLower = href.toLowerCase();
      for (const url of PRIVACY_PATTERNS.urls) {
        if (hrefLower.includes(url)) {
          const location = detectLocation3($, el);
          foundLinks.push({ href, text: text.slice(0, 50), location });
          return;
        }
      }
    });
    const hasSchemaPrivacy = $('script[type="application/ld+json"]').filter((_, el) => {
      const content = $(el).html() || "";
      return /privacyPolicy|privacy.?policy/i.test(content);
    }).length > 0;
    if (foundLinks.length > 0) {
      const inFooter = foundLinks.some((link) => link.location === "footer");
      return {
        ruleId: "eeat-privacy-policy",
        status: "pass",
        score: 100,
        message: `Privacy policy link found${inFooter ? " in footer" : ""} (${foundLinks.length} link${foundLinks.length > 1 ? "s" : ""})`,
        details: {
          hasPrivacyPolicy: true,
          inFooter,
          hasSchemaMarkup: hasSchemaPrivacy,
          links: foundLinks.slice(0, 3)
        }
      };
    }
    return {
      ruleId: "eeat-privacy-policy",
      status: "warn",
      score: 50,
      message: "No privacy policy link found - important for trust and legal compliance",
      details: {
        hasPrivacyPolicy: false,
        recommendation: "Add a link to your privacy policy in the footer of every page"
      }
    };
  }
});
export function detectLocation3($: CheerioAPI, el: Element) {
  const parents = $(el).parents();
  for (let i = 0; i < parents.length; i++) {
    const parent = parents.eq(i);
    const tagName = parent.prop("tagName")?.toLowerCase() || "";
    const className = parent.attr("class")?.toLowerCase() || "";
    const id = parent.attr("id")?.toLowerCase() || "";
    const role = parent.attr("role")?.toLowerCase() || "";
    if (tagName === "footer" || role === "contentinfo" || className.includes("footer") || id.includes("footer")) {
      return "footer";
    }
    if (tagName === "header" || role === "banner" || className.includes("header") || id.includes("header")) {
      return "header";
    }
    if (tagName === "nav" || role === "navigation" || className.includes("nav")) {
      return "navigation";
    }
  }
  return "body";
}
