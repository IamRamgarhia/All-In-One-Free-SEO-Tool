/**
 * Infrastructure URLs never become work.
 *
 * On a real client every critical and high finding in the latest audit
 * was /cdn-cgi/l/email-protection — Cloudflare rewriting a mailto link —
 * and four generators turned those into tasks. The crawler had already
 * been fixed; the stored audit had not, and every reader trusted it.
 */

import { describe, expect, it } from "vitest";
import { isInfrastructureUrl, withoutInfrastructure } from "./infrastructure-urls";

describe("withoutInfrastructure", () => {
  it("drops the Cloudflare link that caused this", () => {
    const rows = [
      { url: "https://prateektapes.com/cdn-cgi/l/email-protection", type: "noindex_set" },
      { url: "https://prateektapes.com/about", type: "noindex_set" },
    ];
    expect(withoutInfrastructure(rows).map((r) => r.url)).toEqual([
      "https://prateektapes.com/about",
    ]);
  });

  it("drops WordPress plumbing too", () => {
    for (const path of ["/wp-json/wp/v2/posts", "/xmlrpc.php", "/wp-admin/admin-ajax.php"]) {
      expect(withoutInfrastructure([{ url: `https://x.com${path}` }]), path).toEqual([]);
    }
  });

  it("keeps real pages, including ones whose path merely mentions a word", () => {
    // A substring match would eat these. The rule is a path prefix.
    const rows = [
      { url: "https://x.com/" },
      { url: "https://x.com/blog/what-is-cdn-cgi" },
      { url: "https://x.com/wp-json-guide" },
    ];
    expect(withoutInfrastructure(rows)).toHaveLength(3);
  });

  it("keeps a row with no URL rather than discarding it", () => {
    // A site-level finding has nothing to filter on, and dropping it
    // would lose a real problem.
    expect(withoutInfrastructure([{ url: null }])).toHaveLength(1);
  });

  it("agrees with isInfrastructureUrl, so the two cannot drift", () => {
    const urls = [
      "https://x.com/cdn-cgi/scripts/rocket.js",
      "https://x.com/contact",
      "https://x.com/xmlrpc.php",
    ];
    const kept = withoutInfrastructure(urls.map((url) => ({ url }))).map((r) => r.url);
    expect(kept).toEqual(urls.filter((u) => !isInfrastructureUrl(u)));
  });
});
