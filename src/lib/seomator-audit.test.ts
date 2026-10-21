import { describe, expect, it } from "vitest";
import { mapSeomatorResult } from "./seomator-audit";
import type { AuditResult } from "@seomator/seo-audit";

function stubResult(
  overrides: Partial<AuditResult> & {
    categoryResults: AuditResult["categoryResults"];
  },
): AuditResult {
  return {
    url: "https://example.com/",
    overallScore: 72,
    timestamp: new Date().toISOString(),
    crawledPages: 2,
    ...overrides,
  };
}

describe("mapSeomatorResult", () => {
  it("keeps fails and warns, drops passes and not-measured", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "core",
            score: 50,
            passCount: 1,
            warnCount: 1,
            failCount: 1,
            results: [
              {
                ruleId: "core-title-present",
                status: "pass",
                message: "ok",
                score: 100,
                details: { pageUrl: "https://example.com/" },
              },
              {
                ruleId: "core-description-present",
                status: "fail",
                message: "Missing meta description",
                score: 0,
                details: {
                  pageUrl: "https://example.com/",
                  fix: "Add a meta description of 120-160 characters.",
                },
              },
              {
                ruleId: "core-h1-present",
                status: "warn",
                message: "Multiple H1s",
                score: 50,
                details: { pageUrl: "https://example.com/about" },
              },
              {
                ruleId: "cwv-lcp",
                status: "not-measured",
                message: "CWV not measured",
                score: 50,
                weight: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );

    expect(mapped.findings).toHaveLength(2);
    expect(mapped.findings.map((f) => f.type)).toEqual([
      "seomator:core-description-present",
      "seomator:core-h1-present",
    ]);
    expect(mapped.findings[0]?.severity).toBe("critical");
    expect(mapped.findings[0]?.fixSteps).toMatch(/meta description/i);
    expect(mapped.findings[0]?.confidence).toBe("definitely");
    expect(mapped.findings[1]?.severity).toBe("medium");
    expect(mapped.findings[1]?.url).toBe("https://example.com/about");
    expect(mapped.summary).toContain("SEOmator deep audit");
    expect(mapped.summary).toContain("| core |");
  });

  it("maps non-critical fails to high, warns to low", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "social",
            score: 40,
            passCount: 0,
            warnCount: 1,
            failCount: 1,
            results: [
              {
                ruleId: "social-og-title",
                status: "fail",
                message: "Missing og:title",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
              {
                ruleId: "social-twitter-card",
                status: "warn",
                message: "Missing twitter:card",
                score: 50,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );

    expect(mapped.findings[0]?.severity).toBe("high");
    expect(mapped.findings[1]?.severity).toBe("low");
  });

  it("dedupes the same rule+url+status", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "links",
            score: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 2,
            results: [
              {
                ruleId: "links-broken-internal",
                status: "fail",
                message: "Broken",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
              {
                ruleId: "links-broken-internal",
                status: "fail",
                message: "Broken again",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );
    expect(mapped.findings).toHaveLength(1);
  });
});
