/**
 * The two checks that need a page served over HTTPS.
 *
 * The fixture site covers 67 of the crawler's 68 finding types by
 * crawling a deliberately broken site, which is the better test because
 * it exercises the real crawl end to end. It cannot cover these: the
 * fixture server speaks plain HTTP, and giving it TLS means generating
 * a certificate on every machine that runs the suite — a dependency and
 * a trust-store argument, for one rule.
 *
 * So these run against `checkPage` directly with a synthetic page. It is
 * a weaker test than a crawl, and it is the difference between this rule
 * being covered and not covered at all.
 *
 * mixed_content is the one that matters. A browser silently blocks an
 * http script on an https page, so the symptom is a feature that stops
 * working with nothing in the page source to explain it.
 */

import { describe, expect, it } from "vitest";
import { checkPage, type FetchedPage } from "./audit";

/** A page with nothing else wrong with it, so only the rule under test fires. */
function page(over: Partial<FetchedPage> = {}): FetchedPage {
  const body =
    "<p>An ordinary paragraph, long enough that the thin-content check has " +
    "nothing to say about it, repeated so the word count clears the floor. ".repeat(
      12,
    );
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    status: 200,
    responseTimeMs: 200,
    redirectHops: 0,
    headers: new Headers({ "content-type": "text/html" }),
    html: `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A page that is otherwise fine</title>
<meta name="description" content="A page with nothing wrong with it except the one thing under test.">
<link rel="canonical" href="https://example.com/">
</head><body><h1>A page</h1>${body}</body></html>`,
    ...over,
  };
}

const types = (p: FetchedPage) => checkPage(p).findings.map((f) => f.type);

describe("mixed content", () => {
  it("flags an http script on an https page", () => {
    expect(
      types(
        page({
          html: page().html.replace(
            "</body>",
            `<script src="http://cdn.example.net/a.js"></script></body>`,
          ),
        }),
      ),
    ).toContain("mixed_content");
  });

  it("flags an http stylesheet too, not just scripts", () => {
    expect(
      types(
        page({
          html: page().html.replace(
            "</head>",
            `<link rel="stylesheet" href="http://cdn.example.net/a.css"></head>`,
          ),
        }),
      ),
    ).toContain("mixed_content");
  });

  it("says nothing when every resource is https", () => {
    expect(
      types(
        page({
          html: page().html.replace(
            "</body>",
            `<script src="https://cdn.example.net/a.js"></script></body>`,
          ),
        }),
      ),
    ).not.toContain("mixed_content");
  });

  it("does not fire on an http page", () => {
    // A page served over http has no mixed content — it has no HTTPS.
    // Reporting both would tell the reader they have two problems when
    // fixing the first removes the second.
    expect(
      types(
        page({
          url: "http://example.com/",
          finalUrl: "http://example.com/",
          html: page().html.replace(
            "</body>",
            `<script src="http://cdn.example.net/a.js"></script></body>`,
          ),
        }),
      ),
    ).not.toContain("mixed_content");
  });

  it("ignores localhost, which is a developer's own machine", () => {
    // A local dev reference is noise in a report, not a security
    // finding, and it cannot be "fixed" on a live site anyway.
    for (const host of ["localhost", "127.0.0.1"]) {
      expect(
        types(
          page({
            html: page().html.replace(
              "</body>",
              `<script src="http://${host}:3000/a.js"></script></body>`,
            ),
          }),
        ),
        `${host} should be ignored`,
      ).not.toContain("mixed_content");
    }
  });
});

describe("no_https", () => {
  it("fires on a page served over http", () => {
    expect(
      types(page({ url: "http://example.com/", finalUrl: "http://example.com/" })),
    ).toContain("no_https");
  });

  it("stays quiet on https", () => {
    // Covered on every fixture page too, where it is tolerated rather
    // than declared — this is the assertion that it is actually
    // conditional rather than always on.
    expect(types(page())).not.toContain("no_https");
  });
});
