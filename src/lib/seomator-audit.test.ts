import { describe, expect, it } from "vitest";
import {
  collapseSiteWide,
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
            categoryId: "social",
            score: 0,
            passCount: 0,
            warnCount: 0,
            failCount: 1,
            results: [
              {
                ruleId: "social-og-title",
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
    expect(tasks.every((t) => t.toolPath === "/audits")).toBe(true);
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
