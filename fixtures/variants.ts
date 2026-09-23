/**
 * Whole-site scenarios, one robots.txt at a time.
 *
 * Some findings are about the site rather than a page — no robots.txt, a
 * malformed one, a crawl-delay, a Disallow that hides pages. They cannot
 * be fixtures in the main set, because a site can only have one
 * robots.txt and the main set needs a valid one for everything else to
 * be testable.
 *
 * So each variant is a separate crawl of a deliberately tiny site: a home
 * page, one ordinary page, and whatever robots.txt the scenario is about.
 * Small on purpose — these check one site-level finding, and every extra
 * page is another chance to trip something unrelated and turn a precise
 * test into a noisy one.
 */

import type { AuditFindingType } from "../src/lib/audit-finding-types";

export type Variant = {
  name: string;
  lesson: string;
  /** The robots.txt body, or null to serve a 404 for it. */
  robots: string | null;
  /** Serve /sitemap.xml, or 404 it. */
  sitemap: boolean;
  /** Findings this scenario must produce, anywhere on the site. */
  expect: AuditFindingType[];
  /**
   * Findings that are a consequence of the scenario rather than its
   * subject — a site with no robots.txt also has no AI-crawler policy,
   * and saying so twice is not a second problem.
   */
  tolerate?: AuditFindingType[];
};

/**
 * The AI-crawler groups only — deliberately no wildcard group.
 *
 * Each variant that needs a wildcard group writes its own, first, with
 * the directive inside it. A file with two "User-agent: *" sections is
 * legal and most parsers read only the first, so a Crawl-delay or
 * Disallow in a later one is never read — which looked exactly like the
 * crawler failing to notice it.
 */
const AI_BOT_GROUPS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"]
  .flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""])
  .join("\n");

export const VARIANTS: Variant[] = [
  {
    name: "No robots.txt at all",
    lesson:
      "Not fatal — crawlers assume they may read everything — but it is the only place to point at a sitemap, and its absence usually means nobody has thought about crawling.",
    robots: null,
    sitemap: false,
    expect: ["missing_robots_txt", "missing_sitemap"],
    // A robots.txt that does not exist cannot name AI crawlers either.
    tolerate: ["missing_ai_crawler_policy", "partial_ai_crawler_policy"],
  },
  {
    name: "robots.txt with no User-agent line",
    lesson:
      "A robots.txt that parses to nothing is worse than none: it looks configured and does nothing, so nobody checks it again.",
    robots: "# just a comment, no rules at all\n",
    sitemap: true,
    expect: ["invalid_robots_txt"],
    tolerate: ["missing_ai_crawler_policy", "partial_ai_crawler_policy"],
  },
  {
    name: "robots.txt that says nothing about AI crawlers",
    lesson:
      "Silence is a decision by default, and a different default for each crawler — some read the site, some do not, and nobody chose.",
    robots: "User-agent: *\nAllow: /\nSitemap: http://HOST/sitemap.xml\n",
    sitemap: true,
    expect: ["missing_ai_crawler_policy"],
  },
  {
    name: "robots.txt with a crawl-delay",
    lesson:
      "Crawl-delay slows every crawler that honours it, including the ones you want. On a large site it can mean pages go months between visits.",
    robots: `User-agent: *\nAllow: /\nCrawl-delay: 1\n\n${AI_BOT_GROUPS}\nSitemap: http://HOST/sitemap.xml\n`,
    sitemap: true,
    expect: ["crawl_delay_applied"],
  },
  {
    name: "robots.txt disallowing a page in the sitemap",
    lesson:
      "The sitemap says 'index this' and robots.txt says 'do not read it'. Google obeys the Disallow, so the page can be indexed with no content at all — a title and nothing else.",
    robots: `User-agent: *\nAllow: /\nDisallow: /ordinary\n\n${AI_BOT_GROUPS}\nSitemap: http://HOST/sitemap.xml\n`,
    sitemap: true,
    expect: ["blocked_by_robots"],
  },
];
