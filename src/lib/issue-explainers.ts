/**
 * Plain-language explanations for every audit issue type, indexed by the
 * `type` string the crawler emits. Each entry has:
 *
 *   - whatIsIt: 1-2 sentences explaining the issue in plain words
 *   - whyItMatters: 1-2 sentences on the SEO impact (linking to Google's
 *     own documentation where possible)
 *   - howToFix: 2-4 bullet steps
 *   - confidence: how sure we are this is worth fixing
 *   - googleDoc: link to the canonical Google source if any
 *   - externalTool: a pre-filled URL to a free Google tool that validates
 *     the fix
 *
 * Used by the "Why does this matter?" expandable on every issue card and
 * by the "Fix it for me" wizard.
 */

/**
 * A snippet, and — the part that actually matters — where to put it and
 * how to get back if it goes wrong.
 *
 * Handing someone code without saying which file, whereabouts in it, and
 * what to back up first is how a working site gets broken by a tool that
 * was trying to help. `where` and `undo` are required for that reason:
 * there is no shape of this object that gives you code and leaves out
 * how to reverse it.
 */
export type FixSnippet = {
  /** For syntax highlighting and to signal what kind of file this is. */
  language: "php" | "html" | "liquid" | "js" | "ts" | "nginx" | "text";
  /** Exactly which file, and where in it. */
  where: string;
  code: string;
  /** How to undo this, in one sentence. */
  undo: string;
  /** Anything that would make this a bad idea on some setups. */
  caution?: string;
};

export type IssueExplainer = {
  whatIsIt: string;
  whyItMatters: string;
  howToFix: string[];
  confidence: "definitely" | "probably" | "test";
  googleDoc?: string;
  externalTool?: (params: { url?: string }) => { label: string; href: string };
  /** Present when the fix is code rather than a setting. */
  snippet?: FixSnippet;
};

export const ISSUE_EXPLAINERS: Record<string, IssueExplainer> = {
  missing_title: {
    whatIsIt:
      "This page has no <title> tag. Google uses your title for the blue clickable headline in search results.",
    whyItMatters:
      "Without a title, Google may invent one from page content, often badly. Click-through rate drops 30-60% with auto-generated titles.",
    howToFix: [
      "Add a unique 50-60 character <title> in the <head>.",
      "Lead with the primary keyword, end with brand.",
      "Make it descriptive of THIS page, not the site overall.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/title-link",
    externalTool: ({ url }) =>
      url
        ? {
            label: "Check in Google's URL Inspection tool",
            href: `https://search.google.com/search-console/inspect?utf8=%E2%9C%93&resource_id=&action=inspect&id=${encodeURIComponent(
              url,
            )}`,
          }
        : { label: "Google Search Console", href: "https://search.google.com/search-console" },
  },
  long_title: {
    whatIsIt:
      "Your <title> is longer than ~60 characters and Google is likely truncating it in search results.",
    whyItMatters:
      "Truncated titles end mid-word with '…' and often hide the keyword that triggered the search. CTR drops 5-15% per character lost.",
    howToFix: [
      "Trim to 50-60 characters max.",
      "Cut adjectives, brand names, and stop words.",
      "Test in our Google preview before publishing.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/title-link",
  },
  short_title: {
    whatIsIt:
      "Your <title> is fewer than ~30 characters and isn't using the space Google gives you.",
    whyItMatters:
      "Short titles miss keyword-match opportunities and look thin in SERPs next to fuller competitor titles.",
    howToFix: [
      "Aim for 50-60 characters.",
      "Add one descriptive modifier (location, year, audience).",
      "Don't pad with keyword spam — Google will rewrite it.",
    ],
    confidence: "probably",
  },
  missing_meta_description: {
    whatIsIt:
      "This page has no <meta name=\"description\"> tag. Google may pull a snippet from random page text instead.",
    whyItMatters:
      "A good description acts as ad copy in search results. Pages without one have 5-10% lower CTR on average.",
    howToFix: [
      "Add a 140-160 character <meta name=\"description\"> in the <head>.",
      "Include the primary keyword naturally + a value prop.",
      "Make it action-oriented (start with a verb).",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/snippet#meta-descriptions",
  },
  long_meta_description: {
    whatIsIt:
      "Your meta description exceeds ~160 characters and Google is cutting it off mid-sentence.",
    whyItMatters:
      "Truncated descriptions lose the call-to-action at the end. CTR impact is small but compounds across thousands of impressions.",
    howToFix: [
      "Trim to 140-160 characters.",
      "Put the keyword + value prop in the first 120 chars.",
      "End with a clear CTA.",
    ],
    confidence: "definitely",
  },
  // missing_h1 lives further down, in the page-structure group.
  //
  // The version that used to be here advised adding "a single <h1>" and
  // making it "differ from the <title> by 10-20 characters for
  // variety". The first repeats the one-H1 rule that CLAUDE.md §3.7
  // rejects; the second is a number nobody has ever justified. The
  // replacement says what the check actually found — no H1 at all — and
  // notes that more than one is valid.
  // The multiple_h1 explainer was removed rather than re-keyed.
  //
  // It told users to reduce a page to one H1, which CLAUDE.md §3.7
  // names as advice this tool will not repeat: multiple H1s are valid
  // in HTML5 and Google has said so explicitly. Its own text conceded
  // "Google says it's OK" and then advised the change anyway, on the
  // grounds that "most ranked pages have exactly one" — which is a
  // correlation, not a reason. The crawler has no such check, so this
  // never displayed; it was wrong advice that happened to be invisible.
  missing_image_alt: {
    whatIsIt:
      "Images on this page have no alt attribute. Alt text describes images for screen readers AND Google's image search.",
    whyItMatters:
      "Missing alt text is an accessibility (WCAG AA) violation and forfeits free traffic from Google Image search.",
    howToFix: [
      "Add descriptive alt='' to every meaningful image.",
      "Decorative images can use alt='' (empty) to be ignored by screen readers.",
      "Don't keyword-stuff — describe what the image actually shows.",
    ],
    confidence: "definitely",
    googleDoc: "https://developers.google.com/search/docs/appearance/google-images",
  },
  broken_link: {
    whatIsIt:
      "This page links to a URL that returns 404 or other error status.",
    whyItMatters:
      "Broken internal links waste crawl budget. Broken external links degrade trust signal — Google's QRG flags it as a low-quality marker.",
    howToFix: [
      "Update the link to the correct current URL.",
      "Or remove it if the destination no longer exists.",
      "For external dead links, swap to an archived version (Wayback) when relevant.",
    ],
    confidence: "definitely",
  },
  redirect_chain: {
    whatIsIt:
      "This URL redirects through 2+ hops before landing. Each redirect adds latency and loses a tiny bit of PageRank.",
    whyItMatters:
      "Google honors only ~5 redirects then gives up. Mobile users abandon at the 2nd redirect's loading spinner.",
    howToFix: [
      "Point the original URL directly to the final destination.",
      "Delete the intermediate redirect.",
      "Audit your .htaccess or redirect manager for chains.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/301-redirects",
  },
  missing_canonical: {
    whatIsIt:
      "This page has no <link rel=\"canonical\"> tag declaring which version Google should index.",
    whyItMatters:
      "Without an explicit canonical, Google guesses. It often picks wrongly when query params or trailing slashes create near-duplicate URLs.",
    howToFix: [
      "Add <link rel=\"canonical\" href=\"https://...self-referencing URL\">.",
      "Use absolute URLs, not relative.",
      "Match exactly — including protocol + trailing slash.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  },
  non_self_canonical: {
    whatIsIt:
      "The canonical tag points to a different URL than the one being crawled, creating ambiguity.",
    whyItMatters:
      "Google may de-index this page entirely if the canonical loops or contradicts other signals (sitemap, internal links).",
    howToFix: [
      "Verify the canonical URL is the one you actually want indexed.",
      "Make sure sitemap + internal links point to the canonical version.",
      "Remove the canonical if the page should self-canonicalize.",
    ],
    confidence: "definitely",
  },
  missing_schema: {
    whatIsIt:
      "No structured data (JSON-LD schema.org) found on this page.",
    whyItMatters:
      "Schema unlocks rich results — star ratings, recipe cards, FAQ accordions, breadcrumbs — which boost CTR up to 35%.",
    howToFix: [
      "Pick the schema type matching your content (Article, Product, FAQPage, etc.).",
      "Use our schema generator tool to produce valid JSON-LD.",
      "Validate with Google's Rich Results Test before publishing.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data",
    externalTool: ({ url }) => ({
      label: "Test in Google's Rich Results Test",
      href: url
        ? `https://search.google.com/test/rich-results?url=${encodeURIComponent(url)}`
        : "https://search.google.com/test/rich-results",
    }),
  },
  slow_lcp: {
    whatIsIt:
      "Largest Contentful Paint (LCP) is over 2.5 seconds — the main content takes too long to render.",
    whyItMatters:
      "LCP is one of three Core Web Vitals Google uses as a ranking signal. Pages failing CWV get a small but real ranking penalty in competitive markets.",
    howToFix: [
      "Preload the LCP image with <link rel=\"preload\">.",
      "Compress + serve WebP/AVIF, not PNG/JPEG.",
      "Defer non-critical CSS/JS that blocks rendering.",
      "Upgrade hosting if TTFB exceeds 800ms.",
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/lcp",
    externalTool: ({ url }) => ({
      label: "Test in PageSpeed Insights",
      href: url
        ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}`
        : "https://pagespeed.web.dev/",
    }),
  },
  poor_cls: {
    whatIsIt:
      "Cumulative Layout Shift (CLS) is over 0.1 — visible elements move around as the page loads.",
    whyItMatters:
      "CLS is a Core Web Vitals signal. Worse: users tap wrong buttons because layout shifted, hurting conversion.",
    howToFix: [
      "Add width + height attributes to every <img> and <video>.",
      "Reserve space for ads + embeds with min-height.",
      "Avoid inserting content above existing content (e.g. cookie banners).",
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/cls",
  },
  poor_inp: {
    whatIsIt:
      "Interaction to Next Paint (INP) is over 200ms — clicks and taps feel laggy.",
    whyItMatters:
      "INP replaced FID as a Core Web Vital in March 2024. Sites in the bottom 25% of INP lose ~10% organic traffic.",
    howToFix: [
      "Break long JavaScript tasks into chunks with setTimeout or requestIdleCallback.",
      "Defer third-party scripts (analytics, ads).",
      "Optimize React: use useMemo for heavy renders, lazy-load below-the-fold components.",
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/inp",
  },
  duplicate_title: {
    whatIsIt:
      "Two or more pages share the exact same <title>. Google may merge them in search results.",
    whyItMatters:
      "Duplicate titles trigger keyword cannibalization — two of your own pages compete for the same query, and Google picks the wrong one.",
    howToFix: [
      "Differentiate each page's title by intent (e.g. 'reviews' vs 'pricing' vs 'guide').",
      "Or canonicalize if they're truly the same content.",
    ],
    confidence: "definitely",
  },
  duplicate_meta_description: {
    whatIsIt:
      "Multiple pages share the same meta description.",
    whyItMatters:
      "Less harmful than duplicate titles but signals laziness to Google's quality system. Each page should describe itself.",
    howToFix: [
      "Write unique descriptions per page.",
      "Or remove them and let Google generate dynamically.",
    ],
    confidence: "probably",
  },
  noindex_set: {
    whatIsIt:
      "This page has a 'noindex' robots directive — Google has been told not to include it in search results.",
    whyItMatters:
      "If intentional (e.g. login, admin pages), this is fine. If accidental on a money page, it's catastrophic — that page earns zero organic traffic.",
    howToFix: [
      "Confirm this page SHOULD be hidden from search.",
      "If not, remove the <meta name=\"robots\" content=\"noindex\"> or X-Robots-Tag header.",
      "Then re-submit the URL in Google Search Console.",
    ],
    confidence: "definitely",
    externalTool: ({ url }) => ({
      label: "Open in Google Search Console",
      href: url
        ? `https://search.google.com/search-console/inspect?id=${encodeURIComponent(url)}`
        : "https://search.google.com/search-console",
    }),
  },
  blocked_by_robots: {
    whatIsIt:
      "Your robots.txt is blocking Googlebot from crawling this URL.",
    whyItMatters:
      "Blocked pages can still be indexed (URL-only, no snippet) but rank poorly. Disallow on important pages = no traffic.",
    howToFix: [
      "Check robots.txt at yoursite.com/robots.txt.",
      "Remove the Disallow line targeting this URL pattern.",
      "Re-submit sitemap in GSC.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  },
  thin_content: {
    whatIsIt:
      "This page has fewer than ~300 words of unique content.",
    whyItMatters:
      "Google's Helpful Content System penalizes pages that don't satisfy user intent. Thin pages on important keywords are a top deindexing cause.",
    howToFix: [
      "Add genuine depth — examples, data, FAQs, original analysis.",
      "Aim for 600-1500 words on commercial pages, 1500+ on informational.",
      "If you can't justify depth, consolidate with a fuller page via 301.",
    ],
    confidence: "probably",
  },
  orphan_pages: {
    whatIsIt:
      "No other page on the site links to this page.",
    whyItMatters:
      "Orphan pages are hard for Google to discover and pass zero PageRank from your site's authority pool.",
    howToFix: [
      "Add 3-5 contextual links to this page from related articles.",
      "Add it to the main navigation or footer if topical.",
      "Use our internal-linking opportunity finder.",
    ],
    confidence: "probably",
  },
  inconsistent_hreflang: {
    whatIsIt:
      "This international site has language/region variants but no hreflang tags connecting them.",
    whyItMatters:
      "Without hreflang, Google may serve the wrong language version to users, causing bounce.",
    howToFix: [
      "Add <link rel=\"alternate\" hreflang=\"en\" href=\"...\"> for each variant.",
      "Include a self-referencing hreflang on every page.",
      "Add x-default for the language picker / global homepage.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/specialty/international/localized-versions",
  },
  no_https: {
    whatIsIt:
      "This URL is served over HTTP, not HTTPS.",
    whyItMatters:
      "HTTPS has been a Google ranking signal since 2014. Chrome flags HTTP pages as 'Not Secure', killing trust + conversions.",
    howToFix: [
      "Get a free SSL cert from Let's Encrypt or use Cloudflare.",
      "301-redirect HTTP → HTTPS on every URL.",
      "Update internal links to HTTPS.",
    ],
    confidence: "definitely",
  },

  // ===================================================================
  // Everything below was added because 34 of the crawler's 52 finding
  // types had no explainer at all. The issue card rendered the problem
  // and nothing about what to do with it — the component returned null
  // for an unknown type, so the absence was invisible.
  // ===================================================================

  // --- Crawl and response ---------------------------------------------

  bad_status: {
    whatIsIt:
      "The server answered with an error code (4xx or 5xx) instead of the page.",
    whyItMatters:
      "Google drops pages that keep returning errors, and any links pointing at them are wasted. A 5xx also means real visitors saw nothing.",
    howToFix: [
      "Open the URL yourself — a 404 means it moved or was deleted, a 500 means the server is failing.",
      "If the page moved, add a 301 redirect to the new URL rather than leaving a 404.",
      "If it was deleted on purpose, that's fine — remove the internal links pointing at it.",
      "If it's a 5xx, check your server error log; this is a site problem, not an SEO one.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
  },
  fetch_failed: {
    whatIsIt:
      "We couldn't load this URL at all — the connection timed out, DNS failed, or the certificate was rejected.",
    whyItMatters:
      "If our crawler can't reach it, Googlebot probably can't either, and a page Google can't fetch cannot rank.",
    howToFix: [
      "Try the URL in a browser. If it loads for you, the problem may be a firewall or bot protection blocking crawlers.",
      "Check the SSL certificate hasn't expired — that's the most common cause.",
      "If you use Cloudflare or similar, check whether its bot-fighting mode is blocking non-browser requests.",
    ],
    confidence: "definitely",
  },
  blocked_url: {
    whatIsIt:
      "This tool refused to fetch the URL because it points at a private or internal address.",
    whyItMatters:
      "Not an SEO problem — it's a safety guard. A public search engine couldn't reach this address either, so a site on one isn't publicly indexable.",
    howToFix: [
      "If you're auditing a site on your own machine or LAN, that's expected — see the hosting docs for the opt-in that allows it.",
      "If this is meant to be a public site, check the domain resolves to a public IP.",
    ],
    confidence: "definitely",
  },
  slow_response: {
    whatIsIt:
      "The server took more than two seconds to start sending this page.",
    whyItMatters:
      "This is server thinking time, before any rendering starts — it delays everything that follows, and Core Web Vitals inherits the whole delay.",
    howToFix: [
      "Turn on page caching so repeat requests skip the database entirely.",
      "Check for slow database queries on the page — this is usually one query, not the whole stack.",
      "Put a CDN in front so visitors far from your server aren't paying for the distance.",
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/ttfb",
  },
  crawl_delay_applied: {
    whatIsIt:
      "Your robots.txt asks crawlers to wait between requests, so this audit ran slower and may have covered fewer pages.",
    whyItMatters:
      "Informational. A long Crawl-delay also slows Googlebot, which means changes take longer to be noticed — worth checking it's deliberate.",
    howToFix: [
      "Open robots.txt and look for the Crawl-delay line.",
      "Unless your server is genuinely struggling, you can usually remove it. Google ignores it anyway; Bing and others don't.",
    ],
    confidence: "test",
  },
  soft_404: {
    whatIsIt:
      "The page returns a success code but the content says it's missing — an empty results page, or a 'not found' message served as 200.",
    whyItMatters:
      "Google treats these as errors regardless of the status code, and spends crawl budget rediscovering them. It also means visitors land on a dead end that looks live.",
    howToFix: [
      "Return a real 404 status for pages that don't exist.",
      "If the page should exist, fix whatever leaves it empty.",
      "For empty search or category pages, return content — related items, or a useful message — rather than nothing.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/http-network-errors#soft-404-errors",
  },

  // --- Indexing and canonicals ----------------------------------------

  xrobots_noindex: {
    whatIsIt:
      "The server sends an X-Robots-Tag header telling search engines not to index this page.",
    whyItMatters:
      "Same effect as a noindex meta tag, but invisible in the page source — which is why it is so often set by accident and never noticed.",
    howToFix: [
      "Check your server config (nginx, Apache) and any CDN rules for an X-Robots-Tag header.",
      "If the page should be indexed, remove the header for that path.",
      "Staging environments often set this site-wide; make sure it didn't follow you to production.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
  },
  invalid_canonical: {
    whatIsIt:
      "The canonical tag on this page points somewhere that isn't a usable URL.",
    whyItMatters:
      "A broken canonical is worse than none: Google may ignore it, or follow it and drop this page from the index in favour of something that doesn't exist.",
    howToFix: [
      "Use an absolute URL — https://example.com/page, not /page.",
      "Check the URL actually loads and returns a 200.",
      "If a plugin generates it, look for a misconfigured site-URL setting.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  },
  canonical_chain: {
    whatIsIt:
      "This page's canonical points at a page whose canonical points somewhere else again.",
    whyItMatters:
      "Google follows one hop reliably and gets vaguer after that. Chains usually mean two plugins are both writing canonicals and disagreeing.",
    howToFix: [
      "Point every page's canonical directly at the final destination.",
      "If two SEO plugins are active, turn canonical output off in one.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  },

  // --- robots.txt and sitemaps ----------------------------------------

  missing_robots_txt: {
    whatIsIt: "There's no robots.txt file at the root of the site.",
    whyItMatters:
      "Not fatal — crawlers assume everything is allowed. It matters mainly because robots.txt is where you point crawlers at your sitemap.",
    howToFix: [
      "Create /robots.txt with `User-agent: *` and `Allow: /`.",
      "Add a `Sitemap:` line with the full URL of your sitemap.",
      "Don't block CSS or JavaScript — Google needs them to render the page as a visitor sees it.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  },
  invalid_robots_txt: {
    whatIsIt:
      "robots.txt exists but has lines that don't parse as valid directives.",
    whyItMatters:
      "Crawlers skip lines they can't read. A typo'd Disallow may be silently ignored — or worse, a valid one may block more than you intended.",
    howToFix: [
      "Check each line is a recognised directive: User-agent, Allow, Disallow, Sitemap, Crawl-delay.",
      "Every Allow/Disallow must sit under a User-agent line.",
      "Paste it into our robots.txt tool, or Search Console's tester, to see how a crawler reads it.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt",
  },
  missing_sitemap: {
    whatIsIt: "No XML sitemap was found at the usual locations.",
    whyItMatters:
      "A sitemap is how you tell Google about pages nothing links to. Without one, anything not reachable by following links may never be discovered.",
    howToFix: [
      "Generate one — most CMSs and SEO plugins do it automatically.",
      "Reference it in robots.txt with a `Sitemap:` line.",
      "Submit it in Search Console so you can see what Google does with it.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  },
  missing_ai_crawler_policy: {
    whatIsIt:
      "robots.txt says nothing about AI crawlers like GPTBot, ClaudeBot or PerplexityBot.",
    whyItMatters:
      "This is a decision, not a defect. Silence means they may crawl you — good if you want to be cited in AI answers, bad if you don't want your content used for training.",
    howToFix: [
      "Decide first: do you want to appear in AI-assistant answers?",
      "To be cited, allow the search-time bots (OAI-SearchBot, PerplexityBot) even if you block training bots (GPTBot, ClaudeBot).",
      "Use our robots.txt AI-policy builder to generate the rules.",
    ],
    confidence: "test",
  },
  partial_ai_crawler_policy: {
    whatIsIt:
      "Your robots.txt names some AI crawlers but not others, which usually means the list was written once and not revisited.",
    whyItMatters:
      "Bots not named fall through to your default rule, so your actual policy may not be what you think — often blocking the ones that would cite you while allowing the ones that train on you.",
    howToFix: [
      "List the major AI crawlers explicitly rather than relying on the default.",
      "Keep the distinction clear: training bots and search-time bots are different decisions.",
    ],
    confidence: "test",
  },

  // --- Page structure --------------------------------------------------

  missing_h1: {
    whatIsIt: "This page has no <h1> heading.",
    whyItMatters:
      "The H1 is the clearest statement of what a page is about, for readers and for search engines. Note this is about having none — more than one H1 is valid HTML5 and not a problem.",
    howToFix: [
      "Add an <h1> that says what this specific page covers.",
      "It should describe the page, not the site — the site name belongs in the header.",
      "Don't hide it with CSS to make a design work; a hidden H1 helps nobody.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/structured-data/article",
  },
  heading_order: {
    whatIsIt:
      "Headings skip levels — an H3 directly after an H1, for example, with no H2 between.",
    whyItMatters:
      "Screen-reader users navigate by heading level, and a skipped level breaks that. The SEO effect is small; the accessibility effect is real.",
    howToFix: [
      "Step down one level at a time: H1, then H2, then H3.",
      "If a heading was chosen for its size, use CSS for that instead.",
    ],
    confidence: "probably",
  },
  missing_lang: {
    whatIsIt: "The <html> tag has no lang attribute.",
    whyItMatters:
      "Screen readers use it to pick a pronunciation, and browsers use it to offer translation. Without it, an English page may be read aloud in the wrong accent.",
    howToFix: [
      'Add lang to the html tag: <html lang="en"> — or "en-GB", "hi", "es" as appropriate.',
      "If the page is genuinely multilingual, set the main language here and mark exceptions inline.",
    ],
    confidence: "definitely",
  },
  weak_anchor_text: {
    whatIsIt:
      'Links on this page use text like "click here", "read more" or a bare URL.',
    whyItMatters:
      "Anchor text tells both readers and search engines what to expect. A screen-reader user listing the links on a page hears \"click here\" eight times and learns nothing.",
    howToFix: [
      "Describe the destination: \"read the 2026 pricing guide\" rather than \"read more\".",
      "Keep it natural — this is about being descriptive, not about stuffing keywords in.",
    ],
    confidence: "probably",
  },
  // --- Social and metadata --------------------------------------------

  short_meta_description: {
    whatIsIt:
      "The meta description is much shorter than the space search results give you.",
    whyItMatters:
      "Not a ranking factor, but it is the sales pitch under your title. A short one leaves room unused, and Google may replace it with page text it picks itself.",
    howToFix: [
      "Aim for roughly 120-155 characters.",
      "Say what the visitor gets from this page, and give them a reason to click.",
      "Write one per page — a repeated description is worse than a short one.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/snippet",
  },
  missing_og_tags: {
    whatIsIt:
      "No Open Graph tags, so social platforms have to guess how to display this page when it's shared.",
    whyItMatters:
      "Without them a shared link shows whatever text and image the platform finds first, which is often a logo and a navigation menu. Shares get far fewer clicks.",
    howToFix: [
      "Add og:title, og:description, og:image and og:url in the <head>.",
      "Use an image around 1200x630 — smaller ones get cropped badly.",
      "Test with the sharing debugger for whichever platform matters to you.",
    ],
    confidence: "probably",
  },
  missing_twitter_card: {
    whatIsIt: "No Twitter/X card tags on this page.",
    whyItMatters:
      "X falls back to Open Graph tags when these are absent, so if you have those this is minor. Without either, shared links render as bare text.",
    howToFix: [
      'Add <meta name="twitter:card" content="summary_large_image">.',
      "If your Open Graph tags are already set, that's usually enough.",
    ],
    confidence: "test",
  },
  missing_favicon: {
    whatIsIt: "No favicon was found.",
    whyItMatters:
      "Google shows a favicon next to your result on mobile. Without one you get a generic globe, which looks unfinished next to competitors.",
    howToFix: [
      "Add a favicon at /favicon.ico, and a larger PNG via a <link rel=\"icon\"> tag.",
      "Make it legible at 16x16 — a full logo usually isn't.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/favicon-in-search",
  },
  article_missing_author: {
    whatIsIt:
      "This looks like an article but its structured data names no author.",
    whyItMatters:
      "Google's guidance on helpful content asks who wrote something and why they're worth reading. An unattributed article gives no answer.",
    howToFix: [
      "Add an author to the Article schema, with a link to a page about them.",
      "Give the author a real byline on the page too, not just in the markup.",
      "Machine-generated content with an invented author is worse than none.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/structured-data/article",
  },

  // --- Mobile and rendering -------------------------------------------

  missing_viewport: {
    whatIsIt: "No viewport meta tag, so mobile browsers render the desktop layout and zoom out.",
    whyItMatters:
      "Text ends up unreadably small on a phone. Most traffic is mobile, and this is the single tag that decides whether the page is usable there.",
    howToFix: [
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
      "Then check the page on an actual phone — the tag alone doesn't make a fixed-width layout responsive.",
    ],
    confidence: "definitely",
  },
  viewport_blocks_zoom: {
    whatIsIt:
      "The viewport tag disables pinch-zoom, with user-scalable=no or a maximum-scale.",
    whyItMatters:
      "It stops anyone with less than perfect eyesight from enlarging your text. This is an accessibility failure under WCAG, and it is almost never necessary.",
    howToFix: [
      "Remove user-scalable=no and any maximum-scale from the viewport tag.",
      "If it was added to stop a layout breaking on zoom, fix the layout instead.",
    ],
    confidence: "definitely",
  },
  js_rendered_only: {
    whatIsIt:
      "The page's content only appears after JavaScript runs — the raw HTML is close to empty.",
    whyItMatters:
      "Google does render JavaScript, but on a delay and not for every page. Anything essential that only exists after render may be missed or indexed late.",
    howToFix: [
      "Server-render or pre-render the important content — title, headings, body text, links.",
      "Make sure internal links are real <a href> elements, not click handlers, or crawlers can't follow them.",
      "Check what Google actually sees with the URL Inspection tool in Search Console.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  },
  render_blocking_scripts: {
    whatIsIt:
      "Scripts in the <head> without defer or async stop the page rendering until they finish downloading.",
    whyItMatters:
      "The visitor stares at a blank screen for as long as those files take. It's one of the most common causes of a slow Largest Contentful Paint.",
    howToFix: [
      "Add defer to scripts that don't need to run before the page draws — that's most of them.",
      "Move analytics and chat widgets to load after the page is interactive.",
      "Inline only the small amount of CSS needed for what's visible first.",
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/render-blocking-resources",
  },
  heavy_html_payload: {
    whatIsIt: "The HTML document itself is unusually large.",
    whyItMatters:
      "Every visitor downloads and parses all of it before anything appears. On a phone connection a large document is felt immediately.",
    howToFix: [
      "Look for inlined base64 images — those belong in files the browser can cache.",
      "Check for a page builder shipping unused markup, or a huge inline JSON blob.",
      "Paginate very long listings rather than rendering everything at once.",
    ],
    confidence: "probably",
  },

  // --- Images -----------------------------------------------------------

  image_missing_dimensions: {
    whatIsIt: "Images have no width and height attributes.",
    whyItMatters:
      "Without them the browser can't reserve space, so the page jumps as images load. That's Cumulative Layout Shift, and it's a Core Web Vital.",
    howToFix: [
      "Add width and height attributes matching the image's real dimensions.",
      "CSS can still resize it — the attributes only tell the browser the aspect ratio in advance.",
      "Most frameworks' image components do this for you.",
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/cls",
  },
  no_lazy_loading: {
    whatIsIt:
      "Images below the fold load immediately instead of when the visitor scrolls to them.",
    whyItMatters:
      "The browser spends bandwidth on images nobody has scrolled to yet, delaying the ones they can see.",
    howToFix: [
      'Add loading="lazy" to images below the fold.',
      'Do NOT lazy-load your main above-the-fold image — that delays it and makes Largest Contentful Paint worse.',
    ],
    confidence: "definitely",
    googleDoc: "https://web.dev/articles/browser-level-image-lazy-loading",
  },
  old_image_formats: {
    whatIsIt: "Images are served as JPEG or PNG rather than WebP or AVIF.",
    whyItMatters:
      "Modern formats are typically 25-50% smaller at the same visual quality. On an image-heavy page that is the single biggest speed win available.",
    howToFix: [
      "Convert to WebP — supported everywhere that matters now.",
      "Serve a JPEG fallback via <picture> if you support very old browsers.",
      "Most CMS plugins and CDNs can convert automatically on upload.",
    ],
    confidence: "probably",
  },

  // --- Security ---------------------------------------------------------

  mixed_content: {
    whatIsIt:
      "An HTTPS page loads some resources — images, scripts, stylesheets — over plain HTTP.",
    whyItMatters:
      "Browsers block or warn on this, so parts of the page may silently not load. It also removes the padlock, which visitors do notice.",
    howToFix: [
      "Change http:// to https:// in the offending URLs.",
      "Check hard-coded links in themes and templates — that's the usual source.",
      "For WordPress, a search-replace across the database usually clears it in one pass.",
    ],
    confidence: "definitely",
  },
  missing_security_headers: {
    whatIsIt:
      "Common security headers are absent — things like Strict-Transport-Security and X-Content-Type-Options.",
    whyItMatters:
      "Not a ranking factor. It matters because these headers close off real attacks cheaply, and because security reviews and enterprise buyers check for them.",
    howToFix: [
      "Add Strict-Transport-Security once you're confident HTTPS works everywhere.",
      "Add X-Content-Type-Options: nosniff and a Referrer-Policy.",
      "Add a Content-Security-Policy last — it's the one most likely to break a page, so test in report-only mode first.",
    ],
    confidence: "probably",
  },

  // --- International ----------------------------------------------------

  hreflang_not_reciprocal: {
    whatIsIt:
      "This page points at a language alternative that doesn't point back at it.",
    whyItMatters:
      "Google requires hreflang to be mutual. A one-way declaration is ignored, so the language targeting you set up quietly does nothing.",
    howToFix: [
      "Every page in a language group must list every other page in the group, including itself.",
      "Use absolute URLs throughout.",
      "Add an x-default for visitors whose language you don't cover.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/specialty/international/localized-versions",
  },
};

/**
 * Look up explainer with graceful fallback for unknown types.
 */
export function getExplainer(type: string): IssueExplainer | null {
  return ISSUE_EXPLAINERS[type] ?? null;
}
