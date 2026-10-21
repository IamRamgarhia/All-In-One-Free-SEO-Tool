import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { trailingSlashRule } from "./misc";
import type { AuditContext } from "@/audit/types";

function ctx(input: {
  url: string;
  finalUrl: string;
  redirected: boolean;
}): AuditContext {
  const html = "<!doctype html><html><head><title>t</title></head><body></body></html>";
  const $ = cheerio.load(html);
  return {
    site: { id: 1, name: "t", url: "https://example.com/" },
    url: input.url,
    rawHtml: html,
    response: {
      url: input.url,
      finalUrl: input.finalUrl,
      status: 200,
      headers: {},
      redirected: input.redirected,
      redirectChain: input.redirected
        ? [{ url: input.url, statusCode: 301 }]
        : [],
      timingMs: 1,
    },
    page: {
      url: input.url,
      finalUrl: input.finalUrl,
      status: 200,
      rawHtml: html,
      headers: {},
      redirectChain: [],
      timingMs: 1,
      title: "t",
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

describe("trailingSlashRule", () => {
  it("warns when slash policy flips between equivalent paths", async () => {
    const r = await trailingSlashRule.check(
      ctx({
        url: "https://example.com/about",
        finalUrl: "https://example.com/about/",
        redirected: true,
      }),
    );
    expect(r.status).toBe("warn");
  });

  it("passes when no redirect", async () => {
    const r = await trailingSlashRule.check(
      ctx({
        url: "https://example.com/about",
        finalUrl: "https://example.com/about",
        redirected: false,
      }),
    );
    expect(r.status).toBe("pass");
  });
});
