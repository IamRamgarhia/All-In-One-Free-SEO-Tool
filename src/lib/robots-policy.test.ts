import { describe, expect, it } from "vitest";
import { parseRobots, isAllowed } from "./robots-policy";

const UA = "Mozilla/5.0 (compatible; SeoToolBot/0.1; +https://localhost)";

function policy(text: string) {
  return parseRobots(text, UA);
}

/**
 * The crawler used to fetch robots.txt only to grade it, never to obey
 * it. These pin the behaviour that makes obeying it correct — because a
 * too-strict parser (blocking pages that are actually allowed) is just
 * as bad as no parser at all: it silently shrinks every audit.
 */
describe("parseRobots + isAllowed", () => {
  it("allows everything when robots.txt is empty", () => {
    expect(isAllowed(policy(""), "/anything")).toBe(true);
  });

  it("honours a simple Disallow", () => {
    const p = policy("User-agent: *\nDisallow: /admin");
    expect(isAllowed(p, "/admin")).toBe(false);
    expect(isAllowed(p, "/admin/users")).toBe(false);
    expect(isAllowed(p, "/public")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    const p = policy("User-agent: *\nDisallow:");
    expect(isAllowed(p, "/anything")).toBe(true);
  });

  it("lets a longer Allow override a shorter Disallow", () => {
    // The canonical case: block a directory, permit one path inside it.
    const p = policy("User-agent: *\nDisallow: /blog\nAllow: /blog/public");
    expect(isAllowed(p, "/blog/private")).toBe(false);
    expect(isAllowed(p, "/blog/public/post")).toBe(true);
  });

  it("prefers Allow when Allow and Disallow are the same length", () => {
    const p = policy("User-agent: *\nDisallow: /x\nAllow: /x");
    expect(isAllowed(p, "/x")).toBe(true);
  });

  it("supports * wildcards", () => {
    const p = policy("User-agent: *\nDisallow: /*.pdf");
    expect(isAllowed(p, "/files/report.pdf")).toBe(false);
    expect(isAllowed(p, "/files/report.html")).toBe(true);
  });

  it("supports the $ end anchor", () => {
    const p = policy("User-agent: *\nDisallow: /*.php$");
    expect(isAllowed(p, "/index.php")).toBe(false);
    expect(isAllowed(p, "/index.php?id=1")).toBe(true);
  });

  it("matches against the query string too", () => {
    const p = policy("User-agent: *\nDisallow: /*?sort=");
    expect(isAllowed(p, "/products?sort=price")).toBe(false);
    expect(isAllowed(p, "/products")).toBe(true);
  });

  it("prefers the most specific matching user-agent group", () => {
    const p = parseRobots(
      [
        "User-agent: *",
        "Disallow: /",
        "",
        "User-agent: SeoToolBot",
        "Disallow: /private",
      ].join("\n"),
      UA,
    );
    // Our own group wins, so only /private is off-limits.
    expect(isAllowed(p, "/public")).toBe(true);
    expect(isAllowed(p, "/private")).toBe(false);
  });

  it("falls back to * when no group names us", () => {
    const p = parseRobots(
      ["User-agent: Googlebot", "Disallow: /g", "", "User-agent: *", "Disallow: /all"].join(
        "\n",
      ),
      UA,
    );
    expect(isAllowed(p, "/all")).toBe(false);
    expect(isAllowed(p, "/g")).toBe(true);
  });

  it("applies one rule block to several consecutive User-agent lines", () => {
    const p = parseRobots(
      ["User-agent: SeoToolBot", "User-agent: OtherBot", "Disallow: /shared"].join(
        "\n",
      ),
      UA,
    );
    expect(isAllowed(p, "/shared")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const p = policy("# comment\n\nUser-agent: *  # trailing\nDisallow: /x\n");
    expect(isAllowed(p, "/x")).toBe(false);
  });

  it("reads Crawl-delay", () => {
    expect(policy("User-agent: *\nCrawl-delay: 2").crawlDelaySec).toBe(2);
    expect(policy("User-agent: *").crawlDelaySec).toBeNull();
    // Garbage shouldn't become NaN and stall the crawler forever.
    expect(policy("User-agent: *\nCrawl-delay: soon").crawlDelaySec).toBeNull();
  });

  it("ignores directives that appear before any User-agent line", () => {
    expect(isAllowed(policy("Disallow: /x"), "/x")).toBe(true);
  });

  it("ignores Sitemap and other non-access directives", () => {
    const p = policy(
      "Sitemap: https://example.com/sitemap.xml\nUser-agent: *\nDisallow: /x",
    );
    expect(isAllowed(p, "/x")).toBe(false);
    expect(isAllowed(p, "/sitemap.xml")).toBe(true);
  });

  it("is case-insensitive on field names", () => {
    const p = policy("USER-AGENT: *\nDISALLOW: /x");
    expect(isAllowed(p, "/x")).toBe(false);
  });

  it("does not block a path that merely shares a prefix substring", () => {
    // /admin must not block /administration-guide by accident — this is
    // prefix matching, and robots.txt patterns are anchored at the start.
    const p = policy("User-agent: *\nDisallow: /admin/");
    expect(isAllowed(p, "/administration-guide")).toBe(true);
    expect(isAllowed(p, "/admin/panel")).toBe(false);
  });
});
