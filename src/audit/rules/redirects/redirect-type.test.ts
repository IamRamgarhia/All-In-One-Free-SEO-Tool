import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { redirectTypeRule } from "./index";
import type { AuditContext } from "@/audit/types";

function ctx(redirectChain: AuditContext["response"]["redirectChain"]): AuditContext {
  const html = "<!doctype html><html><head><title>t</title></head><body></body></html>";
  const $ = cheerio.load(html);
  return {
    site: { id: 1, name: "t", url: "https://example.com/" },
    url: "https://example.com/old",
    rawHtml: html,
    response: {
      url: "https://example.com/old",
      finalUrl: "https://example.com/new",
      status: 200,
      headers: {},
      redirected: redirectChain.length > 0,
      redirectChain,
      timingMs: 1,
    },
    page: {
      url: "https://example.com/old",
      finalUrl: "https://example.com/new",
      status: 200,
      rawHtml: html,
      headers: {},
      redirectChain,
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

describe("redirectTypeRule", () => {
  it("passes when only permanent redirects (301)", async () => {
    const r = await redirectTypeRule.check(
      ctx([{ url: "https://example.com/old", statusCode: 301 }]),
    );
    expect(r.status).toBe("pass");
  });

  it("warns on temporary redirect (302)", async () => {
    const r = await redirectTypeRule.check(
      ctx([{ url: "https://example.com/old", statusCode: 302 }]),
    );
    expect(r.status).toBe("warn");
  });

  it("passes when not a redirect hop", async () => {
    const r = await redirectTypeRule.check(ctx([]));
    expect(r.status).toBe("pass");
  });
});
