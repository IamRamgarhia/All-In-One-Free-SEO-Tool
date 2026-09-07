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
    expect: ["missing_security_headers"],
    // Built at response time, not at module load: this fixture is inside
    // the array it needs to read, so anything eager sees an empty list
    // and the crawler finds a one-page site.
    respond: () => ({
      body: page({
        canonicalPath: "/",
        body:
          prose(2) +
          "<nav><ul>" +
          FIXTURES.filter((f) => f.path !== "/")
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

];
