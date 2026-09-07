/**
 * A small site that is deliberately broken, one rule per page.
 *
 * The crawler emits 72 finding types and, until this existed, nothing
 * proved it detected a single one of them on an actual page. The tests
 * around it checked that the *lists* of finding names agreed with each
 * other — a real guard against drift, and no guard at all against the
 * crawler quietly failing to notice a missing title.
 *
 * That is the same shape as every other bug this session: the code was
 * fine at every layer anyone could see, and the answer was wrong.
 *
 * Each page below states the findings it should produce. The harness
 * (scripts/audit-fixtures.ts) serves them, runs the REAL audit engine
 * against the running copy, and compares. Findings we did not expect are
 * reported as loudly as findings we expected and did not get: an extra
 * finding on a page built to have one problem is a false positive, and a
 * crawler that cries wolf gets ignored.
 *
 * Borrowed in shape from OpenSEO's badseo.dev, which is a good idea and
 * MIT. The pages and the harness here are our own.
 */

import type { AuditFindingType } from "../src/lib/audit-finding-types";

export type Fixture = {
  /** Path on the fixture server, always starting with a slash. */
  path: string;
  /** What the page is called in the report. */
  name: string;
  category: string;
  /** Why this matters — printed when the check fails, and readable copy. */
  lesson: string;
  /** Findings this page MUST produce. */
  expect: AuditFindingType[];
  /**
   * Findings this page may or may not produce, and which are neither
   * required nor treated as false positives.
   *
   * Kept deliberately small. It is the escape hatch that would let this
   * whole suite become decorative, so anything listed here needs a
   * reason next to it.
   */
  tolerate?: AuditFindingType[];
  /**
   * Keep this page out of the home page's link list.
   *
   * It still appears in sitemap.xml, so the crawler finds it and nothing
   * links to it — which is exactly what an orphan page is, and the only
   * way to build one.
   */
  unlinked?: boolean;
  /** Raw response. Byte-level control is the point — status, headers, malformed head. */
  respond: (req: { url: string }) => {
    status?: number;
    headers?: Record<string, string>;
    body: string;
    /** Milliseconds to wait before responding. For slow_response. */
    delayMs?: number;
  };
};

/** Enough prose to clear the 200-word thin-content threshold. */
function prose(paragraphs = 4): string {
  const p =
    "Search engines read a page the way a hurried person does: they look for " +
    "the heading, the first sentence, and whether the rest of the text keeps " +
    "the promise those two made. A page that answers its own title quickly " +
    "and then supports the answer tends to do well, and a page that circles " +
    "the topic without landing on it tends not to, however many words it has. " +
    "The word count is not the point. It is a proxy for whether anyone has " +
    "actually written anything here, and it is a bad proxy, which is why a " +
    "thin-content warning is a prompt to look rather than a verdict. ";
  return Array.from({ length: paragraphs }, () => `<p>${p}</p>`).join("\n");
}

/** A complete, correct page. Everything else is this minus one thing. */
function page(opts: {
  title?: string | null;
  description?: string | null;
  h1?: string | null;
  head?: string;
  body?: string;
  lang?: string | null;
  /**
   * Self-referencing canonical. HOST is substituted by the server, which
   * is the only thing that knows the port.
   *
   * Defaults to none, and every fixture that is not about canonicals
   * passes its own path — otherwise missing_canonical fires on all of
   * them and buries the finding each page actually exists to test.
   */
  canonicalPath?: string | null;
  /** Overrides the slug the generated title and description are built from. */
  slug?: string;
}): string {
  // From `slug`, falling back to the canonical path. The three canonical
  // fixtures omit canonicalPath on purpose — that is their subject — and
  // deriving the slug from it gave all three the same title and the same
  // description, which the crawler then reported as duplicates. Correctly.
  const slug =
    (opts.slug ?? opts.canonicalPath ?? "/").replace(/[^a-z]+/gi, " ").trim() ||
    "home";
  const {
    title = `The ${slug} fixture page, on technical SEO`,
    // Between 50 and 160 characters whatever the slug, or the generated
    // description trips the very checks the other fixtures test.
    description = `The ${slug} fixture. One deliberate mistake, so the audit can be checked.`,
    h1 = `The ${slug} fixture page`,
    head = "",
    body = prose(),
    lang = "en",
    canonicalPath = null,
  } = opts;

  return `<!doctype html>
<html${lang === null ? "" : ` lang="${lang}"`}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${title === null ? "" : `<title>${title}</title>`}
${description === null ? "" : `<meta name="description" content="${description}">`}
<link rel="icon" href="/favicon.ico">
${canonicalPath === null ? "" : `<link rel="canonical" href="http://HOST${canonicalPath}">`}
<meta property="og:title" content="A perfectly ordinary page">
<meta property="og:description" content="Baseline fixture page.">
<meta property="og:image" content="/img.png">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="A perfectly ordinary page">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Baseline"}</script>
${head}
</head>
<body>
${h1 === null ? "" : `<h1>${h1}</h1>`}
${body}
</body>
</html>`;
}

const html = (body: string, extra: Partial<ReturnType<Fixture["respond"]>> = {}) => () => ({
  body,
  ...extra,
});

/**
 * The baseline page with one of its head tags removed.
 *
 * page() supplies a complete, correct head — a viewport, a favicon,
 * Open Graph, a Twitter card, JSON-LD — so that a fixture testing one
 * missing tag does not trip five other checks. Removing one is
 * therefore a subtraction from that string rather than an option on it,
 * which keeps page() from growing a flag per tag.
 */
function pageWithout(
  tag: "viewport" | "icon" | "og" | "twitter" | "jsonld",
  opts: Parameters<typeof page>[0] = {},
): string {
  const html = page(opts);
  switch (tag) {
    case "viewport":
      return html.replace(/<meta name="viewport"[^>]*>\n?/, "");
    case "icon":
      return html.replace(/<link rel="icon"[^>]*>\n?/, "");
    case "og":
      return html.replace(/<meta property="og:[^>]*>\n?/g, "");
    case "twitter":
      return html.replace(/<meta name="twitter:[^>]*>\n?/g, "");
    case "jsonld":
      return html.replace(
        /<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/,
        "",
      );
  }
}

/**
 * Findings reported against paths that are not fixture pages.
 *
 * robots.txt and sitemap.xml are served by the fixture server rather
 * than declared as pages, and the crawler reports against them by URL.
 * Without this the harness had no opinion about them at all — which hid
 * the site-wide checks fetching robots.txt without the private-host
 * allowance, failing, and reporting a robots.txt that was being served
 * perfectly well.
 */
export const SITE_EXPECTATIONS: Record<string, AuditFindingType[]> = {
  // The fixture robots.txt names GPTBot and no other AI crawler, which
  // is exactly the half-finished policy this finding is for.
  "/robots.txt": ["partial_ai_crawler_policy"],
};

export const FIXTURES: Fixture[] = [
  // ---- the control -----------------------------------------------------
  {
    path: "/",
    name: "Baseline — nothing wrong with it",
    category: "Control",
    lesson:
      "The home page is deliberately correct apart from the site-wide checks, which the crawler reports here rather than per page. Anything else appearing here is a false positive, and a crawler that reports problems on a clean page teaches people to ignore it.",
    // Site-level findings, reported against the home URL rather than the
    // page they concern. A per-page fixture for these can never fire —
    // which is worth knowing, and was only discoverable by running it.
    // Every site-wide finding lands here, on the home URL, whatever page
    // actually causes it. Which ones those are is not obvious from the
    // names — duplicate titles, canonical chains and hreflang problems
    // all read as per-page and are not — and running the crawler was the
    // only way to find out.
    expect: [
      "missing_security_headers",
      "orphan_pages",
      "canonical_chain",
      "inconsistent_hreflang",
      "hreflang_not_reciprocal",
    ],
    // Built at response time, not at module load: this fixture is inside
    // the array it needs to read, so anything eager sees an empty list
    // and the crawler finds a one-page site.
    respond: () => ({
      body: page({
        canonicalPath: "/",
        body:
          prose(2) +
          "<nav><ul>" +
          FIXTURES.filter((f) => f.path !== "/" && !f.unlinked)
            .map((f) => `<li><a href="${f.path}">${f.name}</a></li>`)
            .join("\n") +
          "</ul></nav>",
      }),
    }),
  },

  // ---- head tags -------------------------------------------------------
  {
    path: "/head/missing-title",
    name: "No <title> at all",
    category: "Head tags",
    lesson:
      "The title is the headline in search results. With none, Google writes one from whatever text it finds, which is almost always worse than one you would have written.",
    expect: ["missing_title"],
    respond: html(page({ canonicalPath: "/head/missing-title", title: null })),
  },
  {
    path: "/head/long-title",
    name: "Title over 60 characters",
    category: "Head tags",
    lesson: "Past roughly 60 characters the title is cut off mid-phrase in results.",
    expect: ["long_title"],
    respond: html(
      page({
        canonicalPath: "/head/long-title",
        title:
          "An extremely long page title that runs well past the sixty character limit Google uses",
      }),
    ),
  },
  {
    path: "/head/short-title",
    name: "Title under 10 characters",
    category: "Head tags",
    lesson: "A very short title wastes the most valuable line on the results page.",
    expect: ["short_title"],
    respond: html(page({ canonicalPath: "/head/short-title", title: "SEO" })),
  },
  {
    path: "/head/missing-meta",
    name: "No meta description",
    category: "Head tags",
    lesson:
      "Without one, Google composes a snippet from the page body. It is usually a worse sales pitch than a written description.",
    expect: ["missing_meta_description"],
    respond: html(page({ canonicalPath: "/head/missing-meta", description: null })),
  },
  {
    path: "/head/long-meta",
    name: "Meta description over 160 characters",
    category: "Head tags",
    lesson: "Long descriptions get truncated, often mid-sentence.",
    expect: ["long_meta_description"],
    respond: html(
      page({
        canonicalPath: "/head/long-meta",
        description:
          "This meta description is deliberately far longer than the hundred and sixty characters that search results will display, so it will be cut off somewhere around here and the rest of the sentence will never be seen by anyone at all.",
      }),
    ),
  },
  {
    path: "/head/short-meta",
    name: "Meta description under 50 characters",
    category: "Head tags",
    lesson: "A very short description leaves most of the snippet unused.",
    expect: ["short_meta_description"],
    respond: html(page({ canonicalPath: "/head/short-meta", description: "Too short." })),
  },
  {
    path: "/head/no-lang",
    name: "No lang attribute",
    category: "Head tags",
    lesson:
      "Without a lang attribute a screen reader guesses the pronunciation, and search engines guess the market.",
    expect: ["missing_lang"],
    respond: html(page({ canonicalPath: "/head/no-lang", lang: null })),
  },

  // ---- headings and content -------------------------------------------
  {
    path: "/content/missing-h1",
    name: "No H1",
    category: "Content",
    lesson:
      "The H1 is the page's own statement of what it is about, and the strongest on-page signal after the title.",
    expect: ["missing_h1"],
    respond: html(page({ canonicalPath: "/content/missing-h1", h1: null })),
  },
  {
    path: "/content/heading-skip",
    name: "Heading levels skip from H1 to H4",
    category: "Content",
    lesson:
      "Skipping levels breaks the document outline, which is how screen readers navigate and how search engines infer structure.",
    expect: ["heading_order"],
    respond: html(page({ canonicalPath: "/content/heading-skip", body: `<h4>Jumped from h1 to h4</h4>` + prose() })),
  },
  {
    path: "/content/thin",
    name: "Under 200 words",
    category: "Content",
    lesson:
      "Not a rule about length — a prompt to check whether the page says anything a reader could not get elsewhere.",
    expect: ["thin_content"],
    respond: html(page({ canonicalPath: "/content/thin", body: "<p>Three words here.</p>" })),
  },
  {
    path: "/content/no-alt",
    name: "Image with no alt text",
    category: "Content",
    lesson:
      "An image with no alt text is invisible to screen readers and to image search.",
    expect: ["missing_image_alt"],
    // Dimensions and lazy-loading are separate checks this image also
    // trips; they have their own fixtures and are not this page's point.
    tolerate: ["image_missing_dimensions", "no_lazy_loading"],
    respond: html(page({ canonicalPath: "/content/no-alt", body: `<img src="/img.png">` + prose() })),
  },

  // ---- indexability ----------------------------------------------------
  {
    path: "/index/noindex-meta",
    name: "noindex in a meta tag",
    category: "Indexability",
    lesson:
      "The page asks Google not to index it. Occasionally deliberate, frequently left behind after a launch.",
    expect: ["noindex_set"],
    respond: html(page({ canonicalPath: "/index/noindex-meta", head: `<meta name="robots" content="noindex,follow">` })),
  },
  {
    path: "/index/noindex-header",
    name: "noindex in an X-Robots-Tag header",
    category: "Indexability",
    lesson:
      "Same instruction, invisible in the page source. This is the one people hunt for and cannot find.",
    expect: ["xrobots_noindex"],
    respond: () => ({
      headers: { "x-robots-tag": "noindex" },
      body: page({ canonicalPath: "/index/noindex-header" }),
    }),
  },
  {
    path: "/index/no-canonical",
    name: "No canonical tag",
    category: "Indexability",
    lesson:
      "With no canonical, a page reachable at more than one address leaves Google to pick which one ranks.",
    expect: ["missing_canonical"],
    respond: html(page({ slug: "index no canonical",})),
  },
  {
    path: "/index/foreign-canonical",
    name: "Canonical points at another page",
    category: "Indexability",
    lesson:
      "This tells Google to rank a different URL instead. Deliberate for syndicated content, a template bug everywhere else.",
    expect: ["non_self_canonical"],
    respond: html(
      page({ slug: "index foreign canonical", head: `<link rel="canonical" href="http://HOST/head/long-title">` }),
    ),
  },
  {
    path: "/index/broken-canonical",
    name: "Canonical is not a URL",
    category: "Indexability",
    lesson: "A malformed canonical is ignored, so the page ends up with none.",
    expect: ["invalid_canonical"],
    // "http://" with no host is one of the few strings that actually
    // throws. "not a url at all" does not — it resolves against the page
    // as a relative path, which is legal, and the crawler was right to
    // call it non_self_canonical instead.
    respond: html(page({ slug: "index broken canonical", head: `<link rel="canonical" href="http://">` })),
  },

  // ---- HTTP ------------------------------------------------------------
  {
    path: "/http/404",
    name: "Returns 404",
    category: "HTTP",
    lesson: "Linked-to pages that 404 waste crawl budget and lose any link value.",
    expect: ["bad_status"],
    respond: () => ({ status: 404, body: page({ slug: "http not found", canonicalPath: "/http/404", title: "This page could not be found at all" }) }),
  },
  {
    path: "/http/500",
    name: "Returns 500",
    category: "HTTP",
    lesson: "A server error on a crawlable URL is the worst status to serve Google.",
    expect: ["bad_status"],
    respond: () => ({ status: 500, body: page({ slug: "http server error", canonicalPath: "/http/500", title: "Something went wrong on the server" }) }),
  },
  {
    path: "/http/slow",
    name: "Takes over two seconds to respond",
    category: "HTTP",
    lesson:
      "Time to first byte is the part of page speed the server owns, and the part a CDN cannot hide.",
    expect: ["slow_response"],
    respond: () => ({ body: page({ canonicalPath: "/http/slow" }), delayMs: 2400 }),
  },
  {
    path: "/http/broken-link",
    name: "Links to a page that 404s",
    category: "HTTP",
    lesson:
      "A broken internal link is a dead end for a reader and a wasted crawl for a bot.",
    expect: ["broken_link"],
    respond: html(
      page({ canonicalPath: "/http/broken-link", body: `<p><a href="/http/does-not-exist">A link that goes nowhere</a></p>` + prose() }),
    ),
  },

  // ---- head tags the baseline supplies, removed one at a time --------
  {
    path: "/head/no-viewport",
    name: "No viewport meta",
    category: "Head tags",
    lesson:
      "Without it, mobile browsers render the page at desktop width and scale it down, which is the classic 'why is my text tiny on a phone' bug.",
    expect: ["missing_viewport"],
    respond: () => ({
      body: pageWithout("viewport", { canonicalPath: "/head/no-viewport" }),
    }),
  },
  {
    path: "/head/blocks-zoom",
    name: "Viewport blocks pinch-zoom",
    category: "Head tags",
    lesson:
      "user-scalable=no stops people enlarging text. It is an accessibility failure and Google has called it out for years.",
    expect: ["viewport_blocks_zoom"],
    respond: () => ({
      body: pageWithout("viewport", {
        canonicalPath: "/head/blocks-zoom",
        head: `<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">`,
      }),
    }),
  },
  {
    path: "/head/no-favicon",
    name: "No favicon",
    category: "Head tags",
    lesson:
      "Google shows a favicon beside every mobile result. Without one you get a generic globe next to competitors who have theirs.",
    expect: ["missing_favicon"],
    respond: () => ({
      body: pageWithout("icon", { canonicalPath: "/head/no-favicon" }),
    }),
  },
  {
    path: "/head/no-og",
    name: "No Open Graph tags",
    category: "Head tags",
    lesson:
      "Without og:title a shared link renders as a bare URL on every social platform and in most chat apps.",
    expect: ["missing_og_tags"],
    respond: () => ({
      body: pageWithout("og", { canonicalPath: "/head/no-og" }),
    }),
  },
  {
    path: "/head/no-twitter",
    name: "No Twitter card tags",
    category: "Head tags",
    lesson: "Same idea as Open Graph, for the platforms that read the twitter: namespace.",
    expect: ["missing_twitter_card"],
    respond: () => ({
      body: pageWithout("twitter", { canonicalPath: "/head/no-twitter" }),
    }),
  },
  {
    path: "/head/no-schema",
    name: "No structured data",
    category: "Head tags",
    lesson:
      "No JSON-LD means the page cannot qualify for any rich result — no stars, no FAQ block, no breadcrumb.",
    expect: ["missing_schema"],
    respond: () => ({
      body: pageWithout("jsonld", { canonicalPath: "/head/no-schema" }),
    }),
  },

  // ---- images ---------------------------------------------------------
  {
    path: "/images/no-dimensions",
    name: "Images with no width or height",
    category: "Images",
    lesson:
      "Without dimensions the browser cannot reserve space, so everything below the image jumps when it loads. That is most of a bad CLS score.",
    expect: ["image_missing_dimensions"],
    tolerate: ["no_lazy_loading", "old_image_formats"],
    respond: () => ({
      body: page({
        canonicalPath: "/images/no-dimensions",
        body:
          Array.from({ length: 5 }, (_, i) => `<img src="/img.png?d=${i}" alt="Fixture image ${i}" loading="lazy">`).join("") +
          prose(),
      }),
    }),
  },
  {
    path: "/images/no-lazy",
    name: "No image is lazy-loaded",
    category: "Images",
    lesson:
      "Every image downloads before the page settles, including the ones nobody scrolls to.",
    expect: ["no_lazy_loading"],
    tolerate: ["old_image_formats"],
    respond: () => ({
      body: page({
        canonicalPath: "/images/no-lazy",
        body:
          Array.from({ length: 6 }, (_, i) => `<img src="/img.png?l=${i}" alt="Fixture image ${i}" width="100" height="100">`).join("") +
          prose(),
      }),
    }),
  },
  {
    path: "/images/old-formats",
    name: "Only JPEG and PNG",
    category: "Images",
    lesson:
      "WebP and AVIF are typically 25-50% smaller at the same quality, and every browser in use supports WebP.",
    expect: ["old_image_formats"],
    respond: () => ({
      body: page({
        canonicalPath: "/images/old-formats",
        body:
          Array.from({ length: 6 }, (_, i) => `<img src="/img.png?o=${i}" alt="Fixture image ${i}" width="100" height="100" loading="lazy">`).join("") +
          prose(),
      }),
    }),
  },

  // ---- links and scripts ----------------------------------------------
  {
    path: "/links/weak-anchors",
    name: "Anchors that say 'click here'",
    category: "Links",
    lesson:
      "The anchor text tells Google what the linked page is about. 'Click here' tells it nothing, and tells a screen-reader user even less.",
    expect: ["weak_anchor_text"],
    respond: () => ({
      body: page({
        canonicalPath: "/links/weak-anchors",
        body:
          Array.from({ length: 12 }, (_, i) =>
            `<p><a href="/head/short-title?w=${i}">${i < 4 ? "click here" : "a properly described destination " + i}</a></p>`,
          ).join("") + prose(),
      }),
    }),
  },
  {
    path: "/perf/blocking-scripts",
    name: "Three render-blocking scripts in the head",
    category: "Performance",
    lesson:
      "Each one stops the browser painting until it has downloaded and run. async or defer costs one word and removes the stall.",
    expect: ["render_blocking_scripts"],
    respond: () => ({
      body: page({
        canonicalPath: "/perf/blocking-scripts",
        head: [1, 2, 3, 4].map((i) => `<script src="/script-${i}.js"></script>`).join(""),
      }),
    }),
  },
  {
    path: "/content/no-author",
    name: "Article with no author",
    category: "Content",
    lesson:
      "Who wrote it is part of how Google assesses expertise. An article with no byline is anonymous advice.",
    expect: ["article_missing_author"],
    respond: () => ({
      // og:type is not what the check reads. It looks for an <article>
      // element or Article/BlogPosting JSON-LD — which is the right
      // signal, since og:type is set by templates on pages that are not
      // articles at all.
      body: page({
        canonicalPath: "/content/no-author",
        body: `<article>${prose()}</article>`,
      }),
    }),
  },
  // ---- problems that need more than one page --------------------------
  {
    path: "/dupe/one",
    name: "Duplicate title and description (1 of 2)",
    category: "Duplicates",
    lesson:
      "Two pages with the same title make Google choose between them, and it often shows neither. The same description gives searchers no reason to prefer one.",
    expect: ["duplicate_title", "duplicate_meta_description"],
    respond: () => ({
      body: page({
        canonicalPath: "/dupe/one",
        title: "Exactly the same title on two different pages",
        description:
          "Exactly the same description on two different pages, which is the point of this pair of fixtures.",
      }),
    }),
  },
  {
    path: "/dupe/two",
    name: "Duplicate title and description (2 of 2)",
    category: "Duplicates",
    lesson:
      "The other half of the pair above. The finding itself is reported once, against whichever of the two the crawler saw first — so this page declares nothing.",
    expect: [],
    respond: () => ({
      body: page({
        canonicalPath: "/dupe/two",
        title: "Exactly the same title on two different pages",
        description:
          "Exactly the same description on two different pages, which is the point of this pair of fixtures.",
      }),
    }),
  },
  {
    path: "/canonical/chain-a",
    name: "Canonical chain (a → b → c)",
    category: "Duplicates",
    lesson:
      "Google follows one canonical hop. A chain means the page it eventually points at is never reached, so the whole instruction is wasted.",
    // canonical_chain is reported against the home URL, not against the
    // page whose canonical starts the chain. Declared on the home fixture.
    expect: [],
    tolerate: ["non_self_canonical"],
    respond: () => ({
      body: page({
        slug: "canonical chain a",
        head: `<link rel="canonical" href="http://HOST/canonical/chain-b">`,
      }),
    }),
  },
  {
    path: "/canonical/chain-b",
    name: "Canonical chain (middle)",
    category: "Duplicates",
    lesson: "The middle of the chain above.",
    expect: [],
    tolerate: ["non_self_canonical", "canonical_chain"],
    respond: () => ({
      body: page({
        slug: "canonical chain b",
        head: `<link rel="canonical" href="http://HOST/canonical/chain-c">`,
      }),
    }),
  },
  {
    path: "/canonical/chain-c",
    name: "Canonical chain (end)",
    category: "Duplicates",
    lesson: "The end of the chain. This one is self-canonical and correct.",
    expect: [],
    respond: () => ({
      body: page({ canonicalPath: "/canonical/chain-c", slug: "canonical chain c" }),
    }),
  },
  {
    path: "/hreflang/en",
    name: "hreflang points at a page that does not point back",
    category: "International",
    lesson:
      "hreflang has to be reciprocal. If the English page says the French one is its translation and the French one does not say the same, Google ignores both annotations.",
    // Reported against the home URL — see the home fixture.
    expect: [],
    respond: () => ({
      body: page({
        canonicalPath: "/hreflang/en",
        slug: "hreflang en",
        head:
          `<link rel="alternate" hreflang="en" href="http://HOST/hreflang/en">` +
          `<link rel="alternate" hreflang="fr" href="http://HOST/hreflang/fr">`,
      }),
    }),
  },
  {
    path: "/hreflang/fr",
    name: "The page that should point back and does not",
    category: "International",
    lesson:
      "It declares itself and nothing else. A target with no hreflang tags AT ALL is skipped by the reciprocity check, so the broken half of the pair has to carry tags of its own to be seen — which is worth knowing, because a page with none is the commoner mistake and no finding covers it.",
    expect: [],
    respond: () => ({
      body: page({
        canonicalPath: "/hreflang/fr",
        slug: "hreflang fr",
        head: `<link rel="alternate" hreflang="fr" href="http://HOST/hreflang/fr">`,
      }),
    }),
  },
  {
    path: "/http/soft-404",
    name: "Says 'page not found' but returns 200",
    category: "HTTP",
    lesson:
      "A soft 404 tells a person the page is gone and tells Google it is fine, so the empty page gets indexed and competes with real ones.",
    expect: ["soft_404"],
    tolerate: ["thin_content"],
    respond: () => ({
      body: page({
        canonicalPath: "/http/soft-404",
        slug: "http soft not found",
        h1: "Page not found",
        body: "<p>Sorry, we couldn't find that page. It may have been moved.</p>",
      }),
    }),
  },
  {
    path: "/structure/orphan",
    name: "In the sitemap, linked from nowhere",
    category: "Structure",
    lesson:
      "A page nothing links to gets no share of the site's authority and is invisible to anyone browsing. Being in the sitemap is not the same as being reachable.",
    expect: [],
    // The finding is site-wide and reported against the home page, not
    // against the orphan itself — so this fixture creates the condition
    // and the home fixture declares the finding.
    unlinked: true,
    respond: () => ({
      body: page({ canonicalPath: "/structure/orphan", slug: "structure orphan" }),
    }),
  },
  {
    path: "/perf/huge",
    name: "Over a megabyte of HTML",
    category: "Performance",
    lesson:
      "A megabyte of markup is a megabyte the browser parses before it can paint, and it is almost always a template rendering something that should have been paginated.",
    expect: ["heavy_html_payload"],
    respond: () => ({
      body: page({
        canonicalPath: "/perf/huge",
        slug: "perf huge",
        // Comments rather than text, so this does not also become the
        // largest page of prose on the site.
        body: prose() + "<!-- " + "padding ".repeat(140_000) + " -->",
      }),
    }),
  },
];
