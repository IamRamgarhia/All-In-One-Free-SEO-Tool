import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { anchorTextRule } from "./index";
import type { AuditContext } from "@/audit/types";

function ctx(html: string): AuditContext {
  const $ = cheerio.load(html);
  const links: AuditContext["page"]["links"] = [];
  $("a[href]").each((_, el) => {
    links.push({
      href: $(el).attr("href") ?? "",
      text: $(el).text(),
      isInternal: true,
      isNoFollow: false,
    });
  });
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
      title: "t",
      metaDescription: null,
      canonical: null,
      h1s: [],
      links,
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

describe("anchorTextRule", () => {
  it("warns on click here", async () => {
    const r = await anchorTextRule.check(
      ctx('<a href="/x">click here</a>'),
    );
    expect(r.status).toBe("warn");
  });

  it("passes descriptive anchors", async () => {
    const r = await anchorTextRule.check(
      ctx('<a href="/pricing">See pricing plans</a>'),
    );
    expect(r.status).toBe("pass");
  });
});
