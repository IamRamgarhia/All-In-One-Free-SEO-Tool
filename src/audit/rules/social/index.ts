import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

function meta(
  $: import("cheerio").CheerioAPI,
  attr: "property" | "name",
  value: string,
): string | undefined {
  return $(`meta[${attr}="${value}"]`).attr("content")?.trim();
}

export const ogTitleRule = defineRule({
  id: "social-og-title",
  category: "social",
  severity: "medium",
  weight: 10,
  title: "og:title",
  description: "Open Graph title for social previews",
  recommendation: 'Add <meta property="og:title" content="...">.',
  check: async ({ $ }) => {
    const v = meta($, "property", "og:title");
    if (!v) return fail("Missing og:title");
    return pass(`og:title present (${v.length} chars)`);
  },
});

export const ogDescriptionRule = defineRule({
  id: "social-og-description",
  category: "social",
  severity: "medium",
  weight: 9,
  title: "og:description",
  description: "Open Graph description for social previews",
  recommendation: 'Add <meta property="og:description" content="...">.',
  check: async ({ $ }) => {
    const v = meta($, "property", "og:description");
    if (!v) return fail("Missing og:description");
    return pass("og:description present");
  },
});

export const ogImageRule = defineRule({
  id: "social-og-image",
  category: "social",
  severity: "high",
  weight: 12,
  title: "og:image",
  description: "Social shares need a preview image",
  recommendation: "Add og:image (ideally ~1200×630).",
  check: async ({ $ }) => {
    const v = meta($, "property", "og:image");
    if (!v) return fail("Missing og:image");
    return pass("og:image present");
  },
});

export const ogUrlRule = defineRule({
  id: "social-og-url",
  category: "social",
  severity: "low",
  weight: 5,
  title: "og:url",
  description: "og:url should identify the preferred share URL",
  recommendation: 'Add <meta property="og:url" content="...">.',
  check: async ({ $ }) => {
    const v = meta($, "property", "og:url");
    if (!v) return warn("Missing og:url");
    return pass("og:url present");
  },
});

export const ogUrlCanonicalRule = defineRule({
  id: "social-og-url-canonical",
  category: "social",
  severity: "medium",
  weight: 7,
  title: "og:url matches canonical",
  description: "og:url and canonical should agree",
  recommendation: "Ensure og:url matches the canonical URL.",
  check: async ({ $, page }) => {
    const og = meta($, "property", "og:url");
    const canonical = page.canonical;
    if (!og || !canonical) return pass("og:url or canonical missing — skipped");
    try {
      const a = new URL(og, page.finalUrl).href.replace(/\/$/, "");
      const b = new URL(canonical, page.finalUrl).href.replace(/\/$/, "");
      if (a === b) return pass("og:url matches canonical");
      return warn("og:url differs from canonical", { og, canonical });
    } catch {
      return warn("Could not compare og:url and canonical");
    }
  },
});

export const twitterCardRule = defineRule({
  id: "social-twitter-card",
  category: "social",
  severity: "low",
  weight: 6,
  title: "Twitter card",
  description: "twitter:card improves X/Twitter previews",
  recommendation: 'Add <meta name="twitter:card" content="summary_large_image">.',
  check: async ({ $ }) => {
    const v = meta($, "name", "twitter:card");
    if (!v) return warn("Missing twitter:card");
    return pass(`twitter:card=${v}`);
  },
});

export const ogImageSizeRule = defineRule({
  id: "social-og-image-size",
  category: "social",
  severity: "info",
  weight: 3,
  title: "og:image dimensions declared",
  description: "og:image:width/height help platforms reserve space",
  recommendation: "Add og:image:width and og:image:height meta tags.",
  check: async ({ $ }) => {
    const w = meta($, "property", "og:image:width");
    const h = meta($, "property", "og:image:height");
    if (!meta($, "property", "og:image")) return pass("No og:image");
    if (w && h) return pass(`og:image size ${w}×${h}`);
    return warn("og:image without width/height hints");
  },
});

export const socialProfilesRule = defineRule({
  id: "social-profiles",
  category: "social",
  severity: "info",
  weight: 3,
  title: "Social profile links",
  description: "Footer/header social profiles reinforce entity signals",
  recommendation: "Link social profiles; include sameAs in Organization schema.",
  check: async ({ $ }) => {
    const hosts = [
      "facebook.com",
      "twitter.com",
      "x.com",
      "linkedin.com",
      "instagram.com",
      "youtube.com",
    ];
    let n = 0;
    $("a[href]").each((_, el) => {
      const href = ($(el).attr("href") ?? "").toLowerCase();
      if (hosts.some((h) => href.includes(h))) n += 1;
    });
    const sameAs = /sameAs/i.test($('script[type="application/ld+json"]').text());
    if (n > 0 || sameAs) return pass(`Social profile signals (links=${n}, sameAs=${sameAs})`);
    return warn("No social profile links / sameAs detected");
  },
});

const SOCIAL_RULES = [
  ogTitleRule,
  ogDescriptionRule,
  ogImageRule,
  ogUrlRule,
  ogUrlCanonicalRule,
  twitterCardRule,
  ogImageSizeRule,
  socialProfilesRule,
];

export function registerSocialRules(): void {
  for (const rule of SOCIAL_RULES) registerRule(rule);
}

export { SOCIAL_RULES };
