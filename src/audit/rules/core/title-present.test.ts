import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { titlePresentRule } from "./title-present";
import type { AuditContext } from "@/audit/types";

function ctx(html: string): AuditContext {
  const $ = cheerio.load(html);
  const title = $("head > title").first().text().trim() || null;
  return {
    site: { id: 1, name: "t", url: "https://example.com/" },
    url: "https://example.com/",
    rawHtml: html,
    response: {
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      status: 200,
      headers: {},
      redirected: false,
      redirectChain: [],
      timingMs: 1,
    },
    page: {
      url: "https://example.com/",
      finalUrl: "https://example.com/",
      status: 200,
      rawHtml: html,
      headers: {},
      redirectChain: [],
      timingMs: 1,
      title,
      metaDescription: null,
      canonical: null,
      h1s: [],
      links: [],
      depth: 0,
      wordCount: 10,
      fetchedAt: new Date(),
    },
    config: {
      mode: "quick",
      maxPages: 1,
      concurrency: 1,
      render: false,
      measureCwv: false,
      respectRobots: true,
      timeoutMs: 5000,
    },
    $,
  };
}

describe("titlePresentRule", () => {
  it("fails when title is missing", async () => {
    const r = await titlePresentRule.check(ctx("<html><head></head><body></body></html>"));
    expect(r.status).toBe("fail");
  });

  it("passes when title exists", async () => {
    const r = await titlePresentRule.check(
      ctx("<html><head><title>Hello world site</title></head><body></body></html>"),
    );
    expect(r.status).toBe("pass");
  });
});
