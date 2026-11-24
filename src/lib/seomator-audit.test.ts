import { describe, expect, it } from "vitest";
import {
  collapseSiteWide,
  seoScoreOf,
  mapSeomatorResult,
  seomatorFindingsToTasks,
} from "./seomator-audit";
import type { AuditResult } from "@/audit";

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
    expect(mapped.summary).toContain("Technical audit — score");
    expect(mapped.summary).toContain("| Core |");
  });

  it("maps non-critical fails to high, warns to low", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "content",
            score: 40,
            passCount: 0,
            warnCount: 1,
            failCount: 1,
            results: [
              {
                ruleId: "content-word-count",
                status: "fail",
                message: "Missing og:title",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
              {
                ruleId: "content-heading-length",
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

  it("exposes categoryScores for the audit UI", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "core",
            score: 50,
            passCount: 1,
            warnCount: 0,
            failCount: 1,
            results: [
              {
                ruleId: "core-title-present",
                status: "fail",
                message: "Missing title",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );
    expect(mapped.categoryScores.core).toEqual({
      score: 50,
      pass: 1,
      warn: 0,
      fail: 1,
    });
  });
});

describe("seomatorFindingsToTasks", () => {
  it("prefixes titles with P0–P3 plan priorities", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "core",
            score: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 1,
            results: [
              {
                ruleId: "technical-robots-txt",
                status: "fail",
                message: "robots.txt blocks crawl",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
          {
            categoryId: "url",
            score: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 1,
            results: [
              {
                ruleId: "url-slug-keywords",
                status: "fail",
                message: "Missing og:title",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );
    const tasks = seomatorFindingsToTasks(mapped.findings);
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks[0]?.title).toMatch(/^\[P0\]/);
    expect(tasks.some((t) => t.title.startsWith("[P3]"))).toBe(true);
    // Neither rule has a tool that helps (finding-tool-map.ts).
    expect(tasks.every((t) => t.toolPath === "/audits")).toBe(true);
  });

  it("points a task at the rule's tool when one helps", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "core",
            score: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 1,
            results: [
              {
                ruleId: "core-title-present",
                status: "fail",
                message: "Missing title",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );
    const tasks = seomatorFindingsToTasks(mapped.findings);
    expect(tasks[0]?.toolPath).toBe("/tools/meta-tag-generator");
  });
});

describe("collapseSiteWide", () => {
  const f = (type: string, message: string, url: string) => ({ type, message, url });
  const site = "https://example.com/";

  it("keeps a site-wide fact once, on the site URL, with its page count", () => {
    const out = collapseSiteWide(
      [
        f("seomator:security-csp", "Content-Security-Policy header is missing.", "https://example.com/"),
        f("seomator:security-csp", "Content-Security-Policy header is missing.", "https://example.com/a"),
        f("seomator:security-csp", "Content-Security-Policy header is missing.", "https://example.com/b"),
      ],
      site,
    );
    expect(out).toEqual([f("seomator:security-csp", "Content-Security-Policy header is missing. (3 pages)", site)]);
  });

  it("leaves page-specific messages per page", () => {
    const input = [
      f("seomator:core-title-length", "Title is 66 chars.", "https://example.com/"),
      f("seomator:core-title-length", "Title is 71 chars.", "https://example.com/a"),
    ];
    expect(collapseSiteWide(input, site)).toEqual(input);
  });

  it("does not touch a finding seen on a single page", () => {
    const input = [f("seomator:content-word-count", "Thin content detected: 141 words", "https://example.com/a")];
    expect(collapseSiteWide(input, site)).toEqual(input);
  });
});

describe("seoScoreOf", () => {
  const r = (ruleId: string, status: "pass" | "warn" | "fail", weight = 5) => ({ ruleId, status, weight, message: "" });
  const cat = (categoryId: string, results: ReturnType<typeof r>[]) => ({ categoryId, score: 0, results });

  it("is the engine's formula when no good-practice rule is involved", () => {
    const result = {
      overallScore: 75,
      categoryResults: [cat("core", [r("core-title-present", "pass"), r("core-description-present", "fail")])],
    };
    expect(seoScoreOf(result as never)).toBe(50);
  });

  it("good-practice rules do not pull the SEO score down", () => {
    const result = {
      overallScore: 60,
      categoryResults: [
        cat("core", [r("core-title-present", "pass")]),
        cat("security", [r("security-https", "pass"), r("security-csp", "fail"), r("security-hsts", "fail")]),
      ],
    };
    expect(seoScoreOf(result as never)).toBe(100);
  });

  it("a category with only good-practice rules drops out instead of counting", () => {
    const result = {
      overallScore: 70,
      categoryResults: [cat("core", [r("core-title-present", "pass")]), cat("social", [r("social-og-image", "fail")])],
    };
    expect(seoScoreOf(result as never)).toBe(100);
  });

  it("an engine score cap still applies", () => {
    const result = {
      overallScore: 30,
      scoreCap: { uncappedScore: 95, reasons: ["noindex"] },
      categoryResults: [cat("core", [r("core-title-present", "pass")])],
    };
    expect(seoScoreOf(result as never)).toBe(30);
  });
});

describe("good-practice rules in the findings", () => {
  it("a failing good-practice rule is not a finding", () => {
    const mapped = mapSeomatorResult(
      stubResult({
        categoryResults: [
          {
            categoryId: "security",
            score: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 1,
            results: [
              {
                ruleId: "security-csp",
                status: "fail",
                message: "Content-Security-Policy header is missing.",
                score: 0,
                details: { pageUrl: "https://example.com/" },
              },
            ],
          },
        ],
      }),
    );
    expect(mapped.findings).toEqual([]);
  });
});
