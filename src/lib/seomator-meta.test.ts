import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  extractCwv,
  extractScoreCap,
  ruleDisplayName,
  ruleFix,
  seomatorCategories,
  verdictForScore,
} from "./seomator-meta";
import { getExplainer } from "./issue-explainers";
import type { AuditResult } from "@seomator/seo-audit";

describe("seomator-meta", () => {
  it("exposes 20 weighted categories with human names", () => {
    const cats = seomatorCategories();
    expect(cats).toHaveLength(20);
    expect(cats.reduce((s, c) => s + c.weight, 0)).toBe(100);
    expect(categoryLabel("perf")).toBe("Performance");
    expect(categoryLabel("geo")).toBe("AI/GEO Readiness");
  });

  it("resolves rule display names and fix lines", () => {
    expect(ruleDisplayName("cwv-lcp")).toMatch(/LCP|Largest Contentful/i);
    expect(ruleFix("cwv-lcp")).toMatch(/LCP|preload|CDN/i);
    expect(ruleFix("missing-made-up")).toMatch(/SEO best practices/i);
  });

  it("maps scores to SEOmator verdicts", () => {
    expect(verdictForScore(90).grade).toBe("A");
    expect(verdictForScore(30).grade).toBe("F");
  });

  it("extracts CWV metric values from rule details", () => {
    const raw = {
      url: "https://example.com/",
      overallScore: 60,
      timestamp: new Date().toISOString(),
      crawledPages: 1,
      categoryResults: [
        {
          categoryId: "perf",
          score: 40,
          passCount: 0,
          warnCount: 0,
          failCount: 1,
          results: [
            {
              ruleId: "cwv-lcp",
              status: "fail",
              message: "LCP is 5.00s",
              score: 0,
              details: { metric: "LCP", value: 5000, valueFormatted: "5.00s" },
            },
            {
              ruleId: "cwv-cls",
              status: "pass",
              message: "CLS is fine",
              score: 100,
              details: { metric: "CLS", value: 0.05 },
            },
          ],
        },
      ],
    } satisfies AuditResult;

    const cwv = extractCwv(raw);
    expect(cwv?.lcp).toBe(5000);
    expect(cwv?.cls).toBe(0.05);
    expect(cwv?.statuses["cwv-lcp"]).toBe("fail");
  });

  it("extracts score caps", () => {
    const raw = {
      url: "https://example.com/",
      overallScore: 20,
      timestamp: new Date().toISOString(),
      crawledPages: 1,
      categoryResults: [],
      scoreCap: {
        uncappedScore: 72,
        caps: [{ reason: "Homepage is noindex", ceiling: 20 }],
      },
    } as unknown as AuditResult;
    expect(extractScoreCap(raw)).toEqual({
      uncappedScore: 72,
      reasons: ["Homepage is noindex"],
    });
  });
});

describe("getExplainer seomator fallback", () => {
  it("builds an explainer from the SEOmator rule registry", () => {
    const e = getExplainer("seomator:core-title-present");
    expect(e).not.toBeNull();
    expect(e?.whatIsIt).toMatch(/title/i);
    expect(e?.howToFix[0]).toMatch(/title/i);
  });
});
