/**
 * Reading Search Console's URL Inspection and Sitemaps responses.
 *
 * The response bodies are constructed from the API's discovery document
 * (searchconsole v1: InspectUrlIndexResponse, SitemapsListResponse), not
 * captured: calling the API needs a connected property. What these pin
 * down is which documented fields are read, and that a missing or
 * deprecated one is never passed off as a value.
 */

import { describe, expect, it } from "vitest";
import { parseInspectionResponse, parseSitemaps } from "./google-oauth";

const url = "https://x.example/tape?colour=brown";

describe("URL inspection", () => {
  const body = {
    inspectionResult: {
      inspectionResultLink: "https://search.google.com/search-console/inspect?resource_id=x",
      indexStatusResult: {
        verdict: "NEUTRAL",
        coverageState: "Duplicate, Google chose different canonical than user",
        robotsTxtState: "ALLOWED",
        indexingState: "INDEXING_ALLOWED",
        pageFetchState: "SUCCESSFUL",
        lastCrawlTime: "2026-09-01T08:00:00Z",
        crawledAs: "MOBILE",
        googleCanonical: "https://x.example/tape",
        userCanonical: url,
        sitemap: ["https://x.example/sitemap.xml"],
        referringUrls: [],
      },
      richResultsResult: {
        verdict: "PARTIAL",
        detectedItems: [
          {
            richResultType: "Product snippets",
            items: [
              {
                name: "Kraft paper tape",
                issues: [{ issueMessage: "Missing field \"aggregateRating\"", severity: "WARNING" }],
              },
            ],
          },
        ],
      },
    },
  };

  it("reads both canonicals", () => {
    const r = parseInspectionResponse(url, body);
    expect(r.googleCanonical).toBe("https://x.example/tape");
    expect(r.userCanonical).toBe(url);
  });

  it("takes the verdict from the index status, where the API puts it", () => {
    expect(parseInspectionResponse(url, body).verdict).toBe("NEUTRAL");
  });

  it("flattens rich result items with their issues", () => {
    expect(parseInspectionResponse(url, body).richResults).toEqual({
      verdict: "PARTIAL",
      items: [
        {
          type: "Product snippets",
          name: "Kraft paper tape",
          issues: [{ message: "Missing field \"aggregateRating\"", severity: "WARNING" }],
        },
      ],
    });
  });

  it("keeps the link to the inspection in Search Console", () => {
    expect(parseInspectionResponse(url, body).inspectionResultLink).toMatch(/search-console\/inspect/);
  });

  it("returns an error, not an all-null result, when there is no index status", () => {
    // All nulls would sort into "not indexed" with no reason given.
    const r = parseInspectionResponse(url, { inspectionResult: {} });
    expect(r.error).toMatch(/no index status/);
    expect(parseInspectionResponse(url, null).error).toBeDefined();
  });
});

describe("sitemaps", () => {
  it("reads counts that arrive as strings, and ignores the deprecated indexed count", () => {
    const [s] = parseSitemaps({
      sitemap: [
        {
          path: "https://x.example/sitemap.xml",
          type: "SITEMAP",
          isSitemapsIndex: false,
          isPending: false,
          lastSubmitted: "2026-08-01T00:00:00Z",
          lastDownloaded: "2026-09-10T00:00:00Z",
          errors: "0",
          warnings: "2",
          contents: [{ type: "WEB", submitted: "148", indexed: "0" }],
        },
      ],
    });
    expect(s).toMatchObject({ errors: 0, warnings: 2, submitted: [{ type: "WEB", urls: 148 }] });
    expect(JSON.stringify(s)).not.toMatch(/indexed/);
  });

  it("reads a property with no sitemaps as an empty list", () => {
    expect(parseSitemaps({})).toEqual([]);
  });

  it("throws on a shape it does not recognise", () => {
    expect(() => parseSitemaps({ sitemap: "nope" })).toThrow();
  });
});
