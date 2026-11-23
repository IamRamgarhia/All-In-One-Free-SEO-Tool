import { describe, expect, it } from "vitest";
import { isAdvisoryFor, isAdvisoryGeoFinding, isAdvisoryRule, isSiteKind } from "./advisory-rules";
import { seoScoreOf } from "./seo-score";

describe("isAdvisoryFor", () => {
  it("always-advisory rules stay advisory whatever the site", () => {
    expect(isAdvisoryRule("security-csp")).toBe(true);
    for (const kind of [null, "local", "blog"] as const) expect(isAdvisoryFor("security-csp", kind)).toBe(true);
  });

  it("editorial rules count on a blog only", () => {
    expect(isAdvisoryFor("eeat-author-byline", "blog")).toBe(false);
    for (const kind of ["local", "services", "ecommerce", "saas"] as const) {
      expect(isAdvisoryFor("eeat-author-byline", kind)).toBe(true);
    }
  });

  it("local rules count for local businesses and services only", () => {
    expect(isAdvisoryFor("schema-local-business", "local")).toBe(false);
    expect(isAdvisoryFor("schema-local-business", "services")).toBe(false);
    expect(isAdvisoryFor("schema-local-business", "saas")).toBe(true);
  });

  it("product rules count on a shop only", () => {
    expect(isAdvisoryFor("schema-product", "ecommerce")).toBe(false);
    expect(isAdvisoryFor("schema-product", "local")).toBe(true);
  });

  it("without a niche every rule is scored, as before", () => {
    expect(isAdvisoryFor("eeat-author-byline", null)).toBe(false);
    expect(isAdvisoryFor("schema-local-business", undefined)).toBe(false);
  });

  it("core SEO rules are never advisory", () => {
    for (const kind of [null, "local", "ecommerce", "saas", "blog", "services"] as const) {
      expect(isAdvisoryFor("core-title-present", kind)).toBe(false);
    }
  });
});

describe("isAdvisoryGeoFinding", () => {
  it("editorial GEO findings are not problems outside a content site", () => {
    expect(isAdvisoryGeoFinding("geo:content.expertise", "local")).toBe(true);
    expect(isAdvisoryGeoFinding("geo:content.expertise", "blog")).toBe(false);
    expect(isAdvisoryGeoFinding("geo:content.expertise", null)).toBe(false);
    expect(isAdvisoryGeoFinding("geo:platform.llms_txt", "local")).toBe(false);
  });
});

describe("isSiteKind", () => {
  it("accepts the five niches and nothing else", () => {
    for (const v of ["local", "ecommerce", "saas", "blog", "services"]) expect(isSiteKind(v)).toBe(true);
    for (const v of [null, undefined, "", "shop"]) expect(isSiteKind(v)).toBe(false);
  });
});

describe("seoScoreOf with a niche", () => {
  const r = (ruleId: string, status: "pass" | "fail") => ({ ruleId, status, weight: 5, message: "" });
  const result = {
    overallScore: 50,
    categoryResults: [
      { categoryId: "core", results: [r("core-title-present", "pass")] },
      { categoryId: "eeat", results: [r("eeat-author-byline", "fail"), r("eeat-content-dates", "fail")] },
    ],
  };

  it("a local business is not scored down for having no author or dates", () => {
    expect(seoScoreOf(result as never, "local")).toBe(100);
  });

  it("a blog is", () => {
    expect(seoScoreOf(result as never, "blog")).toBeLessThan(100);
  });
});
