/**
 * Sites that look like a particular platform.
 *
 * The stack-specific checks — the wp_*, next_* and shopify_* findings —
 * only run when the crawler has DETECTED that stack, which it does by
 * fetching the page and matching signatures. So they cannot be pages in
 * the main fixture set: that site is a plain HTML site and none of them
 * ever fire.
 *
 * Each entry here is a one-page site carrying the signature and every
 * mistake that stack's rules look for. A kitchen-sink page rather than
 * one page per rule, because the alternative is thirty near-identical
 * WordPress pages and the value is in the rules firing at all.
 */

import type { AuditFindingType } from "../src/lib/audit-finding-types";

export type StackSite = {
  name: string;
  lesson: string;
  /** Extra response headers, for signatures that live there. */
  headers?: Record<string, string>;
  /**
   * Where to point the crawler.
   *
   * Some checks read the URL rather than the markup — an author archive
   * is /author/anything, and Shopify's duplicate-collection check looks
   * for /collections/all in the path. A link to those from the home page
   * proves nothing; the crawl has to start there.
   */
  startPath?: string;
  /** The page body. HOST is substituted by the server. */
  html: string;
  expect: AuditFindingType[];
  tolerate?: AuditFindingType[];
};

const PROSE = Array.from(
  { length: 4 },
  () =>
    "<p>An ordinary paragraph, long enough that the thin-content check has " +
    "nothing to say about it, on a page whose only real job is to look " +
    "exactly like the platform it claims to be.</p>",
).join("");

/** The head every stack page shares, so only stack findings are reported. */
const HEAD = (title: string, extra = "") => `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="A one-page site that looks like a platform, so that platform's rules can be checked.">
<link rel="icon" href="/favicon.ico">
<link rel="canonical" href="http://HOST/">
<meta property="og:title" content="${title}">
<meta property="og:description" content="A stack fixture.">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Stack fixture"}</script>
${extra}`;

export const STACK_SITES: StackSite[] = [
  {
    name: "WordPress with everything wrong with it",
    lesson:
      "Version disclosed, XML-RPC advertised, the REST API linked, the emoji script loaded, the heartbeat running on the front end, default ?p= permalinks, two SEO plugins fighting, block markup with no block stylesheet, and fifteen plugins.",
    html: `<!doctype html>
<html lang="en">
<head>
${HEAD(
  "A WordPress site with every mistake its rules look for",
  `<meta name="generator" content="WordPress 6.5.2">
<link rel="pingback" href="http://HOST/xmlrpc.php">
<link rel="https://api.w.org/" href="http://HOST/wp-json/">
<script src="http://HOST/wp-includes/js/wp-emoji-release.min.js"></script>
<link rel="stylesheet" href="http://HOST/wp-content/plugins/wordpress-seo/css/yoast.css">
<link rel="stylesheet" href="http://HOST/wp-content/plugins/seo-by-rank-math/assets/css/rank-math.css">`,
)}
</head>
<body class="wp-block-post-content">
<h1>A WordPress site</h1>
${PROSE}
<div class="wp-block-group"><p>Block markup, and no stylesheet for it anywhere on the page. The name of that stylesheet is deliberately not written here — the check looks for its absence, and mentioning it in prose is enough to satisfy the test and hide the finding.</p></div>
<p><a href="http://HOST/?p=42">A default permalink</a></p>
<script src="http://HOST/wp-admin/admin-ajax.php"></script>
${Array.from(
  { length: 16 },
  (_, i) =>
    `<link rel="stylesheet" href="http://HOST/wp-content/plugins/plugin-number-${i}/style.css">`,
).join("\n")}
</body>
</html>`,
    expect: [
      "wp_version_disclosed",
      "wp_xmlrpc_exposed",
      "wp_rest_api_advertised",
      "wp_emoji_bloat",
      "wp_heartbeat_on_frontend",
      "wp_default_permalinks",
      "wp_multiple_seo_plugins",
      "wp_missing_block_styles",
      "wp_plugin_bloat",
    ],
    // One page cannot be an author archive and the home page at once —
    // wp_author_archive_indexed needs /author/ in the URL, so it has its
    // own site below.
    tolerate: ["missing_schema", "render_blocking_scripts", "no_lazy_loading"],
  },
  {
    name: "A WordPress author archive that is indexable",
    lesson:
      "Author archives usually duplicate the posts they list, and on a one-author site they duplicate the blog index exactly. Left indexable, they compete with the pages they copy.",
    html: `<!doctype html>
<html lang="en">
<head>
${HEAD("An indexable WordPress author archive", `<meta name="generator" content="WordPress 6.5.2">`)}
</head>
<body>
<h1>Posts by the author</h1>
${PROSE}
<p><a href="http://HOST/wp-content/uploads/photo.jpg">An upload</a></p>
</body>
</html>`,
    startPath: "/author/some-writer",
    expect: ["wp_author_archive_indexed"],
    tolerate: ["wp_version_disclosed"],
  },
  {
    name: "Next.js serving raw <img> and advertising itself",
    lesson:
      "x-powered-by names the framework and its version to anyone scanning, raw <img> skips every optimisation next/image exists to do, and a page that ships hundreds of chunks is usually a barrel import nobody meant to make.",
    headers: { "x-powered-by": "Next.js" },
    html: `<!doctype html>
<html lang="en">
<head>
${HEAD("A Next.js page with raw images", `<script src="http://HOST/_next/static/chunks/main.js"></script>`)}
</head>
<body>
<h1>A Next.js page</h1>
${PROSE}
${Array.from({ length: 6 }, (_, i) => `<img src="/img.png?n=${i}" alt="A raw img tag ${i}" width="100" height="100" loading="lazy">`).join("\n")}
${Array.from({ length: 60 }, (_, i) => `<script src="http://HOST/_next/static/chunks/${i}-abcdef.js" defer></script>`).join("\n")}
<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>
</body>
</html>`,
    expect: ["next_powered_by_header", "next_raw_img_tags", "next_chunk_explosion"],
    tolerate: ["old_image_formats"],
  },
  {
    name: "Shopify with /collections/all and a debug filter left in",
    lesson:
      "/collections/all is a duplicate of every collection at once, and {% liquid %} debug output in a live theme is a template that was never finished.",
    html: `<!doctype html>
<html lang="en">
<head>
${HEAD("A Shopify storefront", `<script src="https://cdn.shopify.com/s/files/theme.js"></script>`)}
</head>
<body>
<h1>A Shopify storefront</h1>
${PROSE}
<p><a href="http://HOST/collections/all">All products</a></p>
<!-- Liquid error: undefined variable product -->
</body>
</html>`,
    // The collections check reads the URL, so the crawl starts there.
    startPath: "/collections/all",
    expect: ["shopify_collections_all", "shopify_liquid_debug"],
  },
];
