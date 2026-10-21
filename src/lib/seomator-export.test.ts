import { describe, expect, it } from "vitest";
import {
  formatSeomatorAuditLlm,
  formatSeomatorAuditMarkdown,
} from "./seomator-export";
import type { AuditResult } from "@seomator/seo-audit";

const minimalRaw: AuditResult = {
  url: "https://example.com",
  overallScore: 72,
  crawledPages: 3,
  timestamp: new Date().toISOString(),
  waivedCaps: [],
  categoryResults: [
    {
      categoryId: "core",
      score: 80,
      passCount: 10,
      warnCount: 1,
      failCount: 0,
      results: [
        {
          ruleId: "core-title-present",
          status: "pass",
          message: "Title present",
          score: 100,
          details: { pageUrl: "https://example.com" },
        },
      ],
    },
    {
      categoryId: "redirect",
      score: 50,
      passCount: 0,
      warnCount: 1,
      failCount: 0,
      results: [
        {
          ruleId: "redirect-type",
          status: "warn",
          message: "Temporary redirect",
          score: 50,
          details: { pageUrl: "https://example.com/old" },
        },
      ],
    },
  ],
};

describe("seomator-export", () => {
  it("renders markdown with score and issues", () => {
    const md = formatSeomatorAuditMarkdown({
      url: "https://example.com",
      score: 72,
      pagesCrawled: 3,
      summary: null,
      rawReport: minimalRaw,
    });
    expect(md).toContain("# SEOmator technical audit");
    expect(md).toContain("72");
    expect(md).toContain("Temporary redirect");
  });

  it("renders LLM block with action items", () => {
    const llm = formatSeomatorAuditLlm({
      url: "https://example.com",
      score: 72,
      pagesCrawled: 3,
      summary: null,
      rawReport: minimalRaw,
    });
    expect(llm).toContain("SEO_AUDIT_LLM");
    expect(llm).toContain("action_items:");
    expect(llm).toContain("rule=redirect-type");
  });
});
