/**
 * Turn audit findings into proposal scope lines.
 *
 * The restraint here IS the feature. A proposal generator that writes
 * "we will increase your organic traffic by 300%" is a lie generator
 * with a PDF export — and a proposal is the worst possible place for an
 * unfounded number, because the client keeps the document and holds you
 * to it.
 *
 * So this maps findings to work, and stops:
 *
 *   - Every line traces to findings that were actually observed. No work
 *     item appears because it is usually in a proposal.
 *   - No traffic, ranking or revenue forecast. None of those can be
 *     predicted from a crawl, and pretending otherwise is how agencies
 *     end up in arguments they lose.
 *   - No effort estimate in hours. We do not know how fast this person
 *     works or what their client's CMS is like.
 *   - Pricing is left entirely to the user. The tool has no basis for
 *     pricing someone else's labour.
 *
 * What it does claim is the honest thing: here is what is wrong, here is
 * the work that addresses it, here is how many pages it affects.
 */

export type ScopeLine = {
  label: string;
  detail: string;
  /** How many findings this line covers. Real count, shown in the PDF. */
  findings: number;
};

export type Finding = {
  type: string;
  severity: string;
  url?: string | null;
};

/**
 * Groups of finding types that are one piece of work.
 *
 * Ordered by the order the work should be presented in — technical
 * foundations before content polish, because that is the order it should
 * be done in and a proposal that reads out of sequence invites
 * questions about whether the author thought about it.
 */
const WORK_ITEMS: {
  label: string;
  detail: string;
  types: string[];
}[] = [
  {
    label: "Fix indexability and crawl blockers",
    detail:
      "Anything stopping search engines reaching or indexing pages — robots rules, noindex tags, broken canonicals, redirect chains. Nothing else moves until these do.",
    types: [
      "noindex_set",
      "blocked_by_robots",
      "missing_robots_txt",
      "invalid_robots_txt",
      "redirect_chain",
      "broken_link",
      "missing_canonical",
      "canonical_mismatch",
      "soft_404",
      "blocked_url",
    ],
  },
  {
    label: "Rewrite page titles and meta descriptions",
    detail:
      "Titles and descriptions that are missing, truncated in search results, or duplicated across pages. This is what people read before deciding whether to click.",
    types: [
      "missing_title",
      "short_title",
      "long_title",
      
      
      "duplicate_title",
      "missing_meta_description",
      "short_meta_description",
      "long_meta_description",
      
      "duplicate_meta_description",
    ],
  },
  {
    label: "Correct heading structure",
    detail:
      "Pages with no H1 or a heading order that doesn't describe the content. Affects how clearly both readers and search engines understand each page.",
    types: ["missing_h1",  "heading_order", "h1_matches_title"],
  },
  {
    label: "Add structured data",
    detail:
      "Schema markup so pages can qualify for rich results — review stars, FAQs, breadcrumbs, product details. Which types apply depends on the page.",
    types: ["missing_schema", "invalid_schema", "schema_error"],
  },
  {
    label: "Image optimisation and alt text",
    detail:
      "Images with no alt text, oversized files, or formats that slow pages down. Covers accessibility and image search as well as speed.",
    types: [
      
      "missing_image_alt",
      "large_image",
      "oversized_image",
      "unoptimised_image",
    ],
  },
  {
    label: "Page speed and Core Web Vitals",
    detail:
      "Loading performance against Google's thresholds. What's achievable depends on the platform, and we'll say plainly what is and isn't controllable on yours.",
    types: [
      "slow_page",
      "poor_lcp",
      "poor_cls",
      "poor_inp",
      "render_blocking",
      "large_page",
    ],
  },
  {
    label: "Mobile and technical hygiene",
    detail:
      "Viewport configuration, HTTPS, security headers, and the small technical details that quietly cost trust signals.",
    types: [
      "missing_viewport",
      "not_https",
      "mixed_content",
      "missing_security_headers",
      "invalid_ssl",
      "missing_hsts",
      // Added after the check reported these as unmapped on a real
      // audit. Leaving them out meant the proposal quietly understated
      // the work — which is the same class of error as overstating it,
      // just in the direction that costs the freelancer money.
      "missing_favicon",
      "missing_lang",
    ],
  },
  {
    label: "Set an AI crawler policy",
    detail:
      "Decide which AI crawlers may use the site's content, and state it in robots.txt. A choice worth making deliberately rather than by default — in either direction.",
    types: ["missing_ai_crawler_policy", "missing_llms_txt"],
  },
  {
    label: "Content depth",
    detail:
      "Pages too thin to answer the query they target, or duplicated across the site. Addressed by rewriting or consolidating, not by adding words.",
    types: ["thin_content", "duplicate_content", "low_word_count"],
  },
  {
    label: "Social and sharing metadata",
    detail:
      "Open Graph and Twitter card tags, so links shared to social platforms and messaging apps render properly instead of as bare URLs.",
    types: ["missing_og_tags", "missing_twitter_card", "missing_og_image"],
  },
  {
    label: "Sitemap and internal linking",
    detail:
      "XML sitemap coverage and the internal links that route authority between pages. Often the cheapest gain on a site that already has content.",
    types: [
      "missing_sitemap",
      "orphan_pages",
      "deep_page",
      "few_internal_links",
    ],
  },
];

/**
 * Build scope lines from findings.
 *
 * Only returns lines with at least one matching finding. A proposal
 * padded with work the site doesn't need is the thing prospects notice
 * and distrust.
 */
export function deriveScope(findings: Finding[]): ScopeLine[] {
  const lines: ScopeLine[] = [];

  for (const item of WORK_ITEMS) {
    const matched = findings.filter((f) => item.types.includes(f.type));
    if (matched.length === 0) continue;
    lines.push({
      label: item.label,
      detail: item.detail,
      findings: matched.length,
    });
  }

  return lines;
}

/**
 * Findings we recognised but have no work item for.
 *
 * Surfaced to the user rather than silently dropped: if an audit is
 * producing types this file doesn't know about, the proposal is
 * understating the work, and the person sending it should be the one to
 * decide what to do about that.
 */
export function unmappedFindingTypes(findings: Finding[]): string[] {
  const known = new Set(WORK_ITEMS.flatMap((i) => i.types));
  return [
    ...new Set(findings.map((f) => f.type).filter((t) => !known.has(t))),
  ].sort();
}

/** Every type this module knows how to scope. Exposed for tests. */
export const SCOPED_TYPES = WORK_ITEMS.flatMap((i) => i.types);
export { WORK_ITEMS };
