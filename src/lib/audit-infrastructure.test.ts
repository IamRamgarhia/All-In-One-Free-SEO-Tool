/**
 * URLs that are plumbing rather than pages.
 *
 * Found on a real client site. Cloudflare's email obfuscation rewrites
 * every mailto in the HTML into a link to
 * `/cdn-cgi/l/email-protection#<hex>`. Fetch that without the fragment —
 * and fragments are never sent to servers — and it returns 404.
 *
 * The crawler followed it and reported three findings on a healthy site:
 * bad_status, noindex_set and missing_meta_description, two of them
 * critical, all pointing at a URL the owner has never heard of and
 * cannot fix. Cloudflare fronts a large share of the web and most sites
 * list an email address, so this was a false positive generator with a
 * very wide blast radius.
 *
 * The risk in the fix is the opposite one: an exclusion list that grows
 * careless starts hiding real pages. These tests pin both edges.
 */

import { describe, expect, it } from "vitest";
import { isInfrastructureUrl } from "./audit";

describe("what gets skipped", () => {
  it("skips the Cloudflare email-protection link", () => {
    expect(
      isInfrastructureUrl(
        "https://example.com/cdn-cgi/l/email-protection#610d000d",
      ),
    ).toBe(true);
  });

  it("skips the whole cdn-cgi namespace, not just that one path", () => {
    // Cloudflare reserves all of it — Rocket Loader, challenge pages,
    // trace. None of them are content and new ones appear over time.
    for (const p of [
      "/cdn-cgi/l/email-protection",
      "/cdn-cgi/scripts/rocket-loader.min.js",
      "/cdn-cgi/trace",
      "/cdn-cgi/challenge-platform/h/b/orchestrate",
    ]) {
      expect(isInfrastructureUrl(`https://example.com${p}`), p).toBe(true);
    }
  });

  it("skips WordPress endpoints that themes link to", () => {
    // admin-ajax answers 400 to a GET with no action, and wp-json is an
    // API. Both get linked from real templates.
    for (const p of ["/wp-admin/admin-ajax.php", "/wp-json/", "/xmlrpc.php"]) {
      expect(isInfrastructureUrl(`https://example.com${p}`), p).toBe(true);
    }
  });
});

describe("what must never be skipped", () => {
  it("keeps ordinary pages", () => {
    for (const p of ["/", "/about", "/blog/post-1", "/services/seo"]) {
      expect(isInfrastructureUrl(`https://example.com${p}`), p).toBe(false);
    }
  });

  it("does not match the pattern anywhere but the start of the path", () => {
    // A blog post about Cloudflare is a real page. Matching a substring
    // rather than a prefix would silently drop it.
    for (const p of [
      "/blog/what-is-cdn-cgi",
      "/docs/cdn-cgi-explained",
      "/wp-json-api-guide",
    ]) {
      expect(isInfrastructureUrl(`https://example.com${p}`), p).toBe(false);
    }
  });

  it("keeps a page whose name merely starts similarly", () => {
    // "/wp-admin/admin-ajax.php" is excluded; "/wp-admin-guide" is a
    // page somebody wrote.
    expect(isInfrastructureUrl("https://example.com/wp-admin-guide")).toBe(
      false,
    );
  });

  it("says no rather than throwing on a malformed URL", () => {
    // Returning false means "crawl it", and the crawler already handles
    // a URL it cannot fetch. Throwing here would abort the whole crawl
    // over one bad href.
    for (const u of ["", "not a url", "javascript:void(0)"]) {
      expect(() => isInfrastructureUrl(u)).not.toThrow();
      expect(isInfrastructureUrl(u), u).toBe(false);
    }
  });
});
