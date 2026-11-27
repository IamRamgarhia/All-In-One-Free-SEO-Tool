import { describe, expect, it } from "vitest";
import { getAllRules } from "@/audit/catalog";
import { COMPLEMENTARY_RULES, INFORMATIVE_RULES, OFF_TOPIC_RULES, ruleTier } from "./rule-tiers";
import { ADVISORY_RULES, isAdvisoryFor } from "./advisory-rules";

const engineIds = new Set(getAllRules().map((r) => r.id));
// Rules of SEOmator 8.0.1 the port does not carry yet: listed so the tiers
// are ready when they land, and allowed to be missing until then.
const V8_ONLY = new Set([
  "a11y-axe-aria", "a11y-axe-frames", "a11y-axe-keyboard", "a11y-axe-landmarks", "a11y-axe-language",
  "a11y-axe-lists", "a11y-axe-media", "a11y-axe-names", "a11y-axe-other", "a11y-axe-tables",
  "core-obsolete-robots-directives", "htmlval-body-structure", "images-oversized-delivery", "perf-unused-css",
  "perf-unused-js", "social-duplicate-og", "social-meta-multiple", "social-og-image-reachable",
  "social-twitter-attribute",
]);

describe("rule tiers", () => {
  it("names only rules the engine has (or will have in 8.0.1)", () => {
    for (const set of [COMPLEMENTARY_RULES, INFORMATIVE_RULES, OFF_TOPIC_RULES]) {
      for (const id of set) expect(engineIds.has(id) || V8_ONLY.has(id), id).toBe(true);
    }
  });

  it("puts each rule in one tier only", () => {
    const seen = [...COMPLEMENTARY_RULES, ...INFORMATIVE_RULES, ...OFF_TOPIC_RULES];
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("keeps outside the score exactly the informative and off-topic rules", () => {
    for (const id of engineIds) {
      const tier = ruleTier(id);
      expect(ADVISORY_RULES.has(id), id).toBe(tier === "info" || tier === "hors");
    }
  });

  it("reads Google's rules as SEO", () => {
    for (const id of ["core-title-present", "core-canonical-valid", "technical-robots-txt-valid", "cwv-lcp", "security-https", "a11y-link-text"]) {
      expect(ruleTier(id)).toBe("seo");
    }
  });

  it("files security headers and consent as off-topic, accessibility and social cards as informative", () => {
    expect(ruleTier("security-csp")).toBe("hors");
    expect(ruleTier("legal-cookie-consent")).toBe("hors");
    expect(ruleTier("a11y-color-contrast")).toBe("info");
    expect(ruleTier("social-og-image")).toBe("info");
    expect(ruleTier("perf-brotli")).toBe("comp");
  });

  it("makes a site-kind rule complementary on its kind of site and informative elsewhere", () => {
    expect(ruleTier("schema-local-business", "local")).toBe("comp");
    expect(ruleTier("schema-local-business", "saas")).toBe("info");
    expect(ruleTier("eeat-author-byline", "blog")).toBe("comp");
    expect(ruleTier("eeat-author-byline", "services")).toBe("info");
    expect(isAdvisoryFor("eeat-author-byline", "services")).toBe(true);
  });

  it("accepts the stored finding type as well as the bare rule id", () => {
    expect(ruleTier("seomator:security-csp")).toBe("hors");
  });
});
