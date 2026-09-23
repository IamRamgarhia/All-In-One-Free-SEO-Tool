/**
 * Tech-stack-aware audit rules.
 *
 * On top of the generic checks in lib/audit.ts, this module adds checks
 * specific to WordPress and React-family sites (Next.js, Gatsby, generic
 * client-rendered React). These are the two dominant platforms — WordPress
 * is ~43% of the web; React-stack sites dominate "modern" dev.
 *
 * Each platform has a different set of foot-guns:
 *
 * WordPress:
 *   - Plugin bloat (12+ plugins in /wp-content/plugins/)
 *   - Multiple SEO plugins active (Yoast + RankMath conflict)
 *   - Default permalink structure (?p=123)
 *   - Exposed wp-login.php / xmlrpc.php (attack surface)
 *   - WordPress version disclosure in <meta generator>
 *   - /wp-json/ open without auth
 *   - Emoji script bloat
 *   - Unrestricted author archives
 *
 * React / Next.js / Gatsby:
 *   - Client-rendered content (already flagged generically as js_rendered_only,
 *     but layer Next-specific guidance)
 *   - Missing per-route metadata (no <title> per route)
 *   - Bundle size from large _next chunks
 *   - SPA returns 200 on unknown route (soft 404)
 *   - Hydration mismatch artifacts
 *   - <img> instead of next/image (already flagged via image format check)
 *   - Missing X-Powered-By: Next.js header strip (leaks version)
 *
 * The audit calls runTechSpecificChecks(html, url, techNames) and gets back
 * findings tagged with the tech name so the UI can group them.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type TechFinding = {
  type: string;
  severity: Severity;
  message: string;
  url: string;
  tech: string;
  /** 5-layer fix guidance per CLAUDE.md Part 10 design principle. */
  fix?: {
    generic: string;
    techCause: string;
    techFix: string;
    pluginThemeHint?: string;
  };
};

export type TechContext = {
  isWordPress: boolean;
  isReactStack: boolean;
  isNextJs: boolean;
  isGatsby: boolean;
  isNuxt: boolean;
  isShopify: boolean;
  isWix: boolean;
  isSquarespace: boolean;
  hasWoocommerce: boolean;
  hostingHint?: string;
};

export function classifyTech(techNames: string[]): TechContext {
  const names = new Set(techNames.map((n) => n.toLowerCase()));
  return {
    isWordPress: names.has("wordpress"),
    isReactStack:
      names.has("next.js") || names.has("nuxt.js") || names.has("gatsby"),
    isNextJs: names.has("next.js"),
    isGatsby: names.has("gatsby"),
    isNuxt: names.has("nuxt.js"),
    isShopify: names.has("shopify"),
    isWix: names.has("wix"),
    isSquarespace: names.has("squarespace"),
    hasWoocommerce: names.has("woocommerce"),
  };
}

/**
 * Run all tech-specific checks against a fetched page. Doesn't perform
 * extra network — operates on the already-fetched HTML + headers + URL.
 */
export function runTechSpecificChecks(opts: {
  url: string;
  html: string;
  headers: Headers;
  tech: TechContext;
}): TechFinding[] {
  const out: TechFinding[] = [];
  const { url, html, headers, tech } = opts;

  // ═════════════════════════════════════════════════════════════════════
  // WordPress
  // ═════════════════════════════════════════════════════════════════════
  if (tech.isWordPress) {
    out.push(...wordpressChecks(url, html, headers));
  }

  // ═════════════════════════════════════════════════════════════════════
  // React / Next.js / Gatsby / Nuxt
  // ═════════════════════════════════════════════════════════════════════
  if (tech.isReactStack) {
    out.push(...reactStackChecks(url, html, headers, tech));
  }

  // Shopify gets a couple of platform-specific checks too
  if (tech.isShopify) {
    out.push(...shopifyChecks(url, html, headers));
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────
// WordPress checks
// ────────────────────────────────────────────────────────────────────────

/**
 * Whether the page has a link — an <a>, on its own site — to a WordPress
 * plain permalink: ?p=123 for a post, ?page_id=2 for a page.
 *
 * Links only. WordPress core prints <link rel='shortlink' href='/?p=ID'>
 * in the head of every post and page whatever the permalink setting, so
 * matching any href told a site whose URLs are /contact-us/ — a real
 * client, 14 pages — to switch to post-name permalinks, at high severity.
 */
function linksToPlainPermalink(html: string, pageUrl: string): boolean {
  let host: string;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
  for (const m of html.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    let target: URL;
    try {
      target = new URL(m[1].replace(/&amp;/g, "&"), pageUrl);
    } catch {
      continue;
    }
    if (target.hostname.replace(/^www\./, "") !== host) continue;
    if (/^\d+$/.test(target.searchParams.get("p") ?? "")) return true;
    if (/^\d+$/.test(target.searchParams.get("page_id") ?? "")) return true;
  }
  return false;
}

function wordpressChecks(
  url: string,
  html: string,
  headers: Headers,
): TechFinding[] {
  const out: TechFinding[] = [];

  // 1. WordPress version disclosure
  const wpGen = html.match(
    /<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s+([\d.]+)/i,
  )?.[1];
  if (wpGen) {
    out.push({
      type: "wp_version_disclosed",
      severity: "low",
      url,
      tech: "WordPress",
      message: `WordPress version ${wpGen} disclosed in <meta generator>. Helps attackers fingerprint vulnerable installs.`,
      fix: {
        generic: "Don't disclose CMS version numbers in HTML.",
        techCause:
          "WordPress emits <meta name='generator' content='WordPress X.Y.Z'> by default.",
        techFix:
          "Add to your theme's functions.php: remove_action('wp_head', 'wp_generator');",
        pluginThemeHint:
          "Most SEO plugins (Yoast, RankMath, SEOPress) include a 'remove generator' option in their settings.",
      },
    });
  }

  // 2. xmlrpc.php exposure — informational; we don't actually probe it here
  //    (that would require an extra request). Flag if there's an
  //    XML-RPC pingback link.
  if (
    /<link[^>]+rel=["']pingback["']/i.test(html) ||
    /\/xmlrpc\.php/i.test(html)
  ) {
    out.push({
      type: "wp_xmlrpc_exposed",
      severity: "medium",
      url,
      tech: "WordPress",
      message:
        "xmlrpc.php / pingback link exposed. xmlrpc is a common DDoS amplification vector and rarely needed in 2026.",
      fix: {
        generic: "Disable legacy XML-RPC unless you actively use it.",
        techCause: "WordPress enables xmlrpc by default.",
        techFix:
          "Block in .htaccess: <Files xmlrpc.php> Order Deny,Allow; Deny from all; </Files>",
        pluginThemeHint: "Wordfence and Disable XML-RPC plugins handle this.",
      },
    });
  }

  // 3. Multiple SEO plugins active (Yoast + RankMath + AIOSEO + SEOPress)
  const seoPlugins = [
    { match: /wp-content\/plugins\/wordpress-seo\//, name: "Yoast SEO" },
    { match: /wp-content\/plugins\/seo-by-rank-math\//, name: "RankMath" },
    {
      match: /wp-content\/plugins\/all-in-one-seo-pack\//,
      name: "All-in-One SEO",
    },
    { match: /wp-content\/plugins\/wp-seopress\//, name: "SEOPress" },
  ];
  const activeSeo = seoPlugins.filter((p) => p.match.test(html));
  if (activeSeo.length >= 2) {
    out.push({
      type: "wp_multiple_seo_plugins",
      severity: "high",
      url,
      tech: "WordPress",
      message: `Multiple SEO plugins active: ${activeSeo.map((p) => p.name).join(", ")}. They conflict (double meta tags, conflicting schema, duplicate sitemaps).`,
      fix: {
        generic: "Run exactly one SEO plugin.",
        techCause:
          "Each plugin injects its own <title>, meta, and schema, often overwriting one another silently.",
        techFix:
          "Pick one (Yoast or RankMath are the most maintained), deactivate + delete the others.",
      },
    });
  }

  // 4. Plugin bloat (count distinct plugin slugs in /wp-content/plugins/)
  const pluginSlugs = new Set<string>();
  const pluginRe = /\/wp-content\/plugins\/([a-z0-9_-]+)\//gi;
  let pm;
  while ((pm = pluginRe.exec(html))) {
    pluginSlugs.add(pm[1].toLowerCase());
  }
  if (pluginSlugs.size >= 15) {
    out.push({
      type: "wp_plugin_bloat",
      severity: "medium",
      url,
      tech: "WordPress",
      message: `${pluginSlugs.size} distinct plugins detected loading assets on this page. Plugin bloat is the #1 WordPress speed killer.`,
      fix: {
        generic: "Audit and remove unused plugins.",
        techCause:
          "Each plugin loads its own CSS/JS site-wide unless explicitly conditional.",
        techFix:
          "Install Asset CleanUp or Perfmatters to disable plugin assets on pages where they're not needed. Plugin Organizer lets you selectively disable.",
      },
    });
  }

  // 5. Emoji script bloat — WP loads wp-emoji-release.min.js even if unused
  if (/wp-emoji|wp-emoji-release\.min\.js/i.test(html)) {
    out.push({
      type: "wp_emoji_bloat",
      severity: "low",
      url,
      tech: "WordPress",
      message:
        "WordPress emoji script is loaded. Most sites don't need it — costs a render-blocking request.",
      fix: {
        generic: "Disable unused scripts.",
        techCause:
          "WordPress emits wp-emoji-release.min.js by default since modern browsers render emoji natively.",
        techFix:
          "Add to functions.php: remove_action('wp_head', 'print_emoji_detection_script', 7); remove_action('wp_print_styles', 'print_emoji_styles');",
        pluginThemeHint:
          "Disable Emojis (Tiny Plugin) handles this without theme edits.",
      },
    });
  }

  // 6. Block editor classnames present but no <link rel=stylesheet>
  //    for block library — flag for sites using Gutenberg
  if (
    /class=["'][^"']*wp-block-/i.test(html) &&
    !/wp-block-library/i.test(html)
  ) {
    out.push({
      type: "wp_missing_block_styles",
      severity: "low",
      url,
      tech: "WordPress",
      message:
        "Block editor blocks render but block-library CSS isn't loaded — page may look broken in browsers that didn't cache the styles.",
      fix: {
        generic: "Ship the CSS your markup depends on.",
        techCause:
          "A 'disable block styles' tweak in the theme or a plugin removed the styles even though blocks remain.",
        techFix:
          "Verify wp_enqueue_style('wp-block-library') is called. Often a 'speed plugin' removed it incorrectly.",
      },
    });
  }

  // 7. Default permalink (/?p=123) — flag only when a link on the page
  //    points at one. See linksToPlainPermalink for why not any href.
  if (linksToPlainPermalink(html, url)) {
    out.push({
      type: "wp_default_permalinks",
      severity: "high",
      url,
      tech: "WordPress",
      message:
        "Pages link to /?p=123 (default permalink). Switch to %postname% for readable, keyword-friendly URLs.",
      fix: {
        generic: "Use descriptive URL slugs containing target keywords.",
        techCause:
          "WordPress defaults to /?p=ID which contains zero SEO value.",
        techFix:
          "Settings → Permalinks → Post name. Then set 301 redirects from old /?p= URLs.",
      },
    });
  }

  // 8. /wp-json/ exposed in HTML — fine if intentional, flag for security review
  if (/<link[^>]+rel=["']https:\/\/api\.w\.org\/["']/i.test(html)) {
    out.push({
      type: "wp_rest_api_advertised",
      severity: "low",
      url,
      tech: "WordPress",
      message:
        "REST API endpoint is advertised in <head>. Fine if your headless setup needs it; otherwise consider disabling — bots probe /wp-json/wp/v2/users to enumerate user logins.",
      fix: {
        generic: "Lock down endpoints you don't need.",
        techCause: "WordPress emits <link rel='https://api.w.org/'> by default.",
        techFix:
          "remove_action('wp_head', 'rest_output_link_wp_head'); — or restrict /wp-json/wp/v2/users via Wordfence/iThemes Security.",
      },
    });
  }

  // 9. Author archives — Yoast/RankMath usually noindex these, flag if not
  const authorArchive = /\/author\//i.test(url);
  if (authorArchive && !/noindex/i.test(html)) {
    out.push({
      type: "wp_author_archive_indexed",
      severity: "medium",
      url,
      tech: "WordPress",
      message:
        "Author archive URL is indexable. For single-author sites these duplicate the homepage; for multi-author sites they're often thin.",
      fix: {
        generic:
          "Noindex thin/duplicate archive pages or improve them with author bios + Person schema.",
        techCause:
          "WordPress generates an author archive for every published-with user automatically.",
        techFix:
          "Yoast: Settings → Search Appearance → Archives → Author archives → Disable OR keep enabled but flesh out the author page with a real bio.",
      },
    });
  }

  // 10. Heartbeat API on front-end (admin-ajax.php pings)
  if (/admin-ajax\.php/i.test(html)) {
    out.push({
      type: "wp_heartbeat_on_frontend",
      severity: "low",
      url,
      tech: "WordPress",
      message:
        "admin-ajax.php is referenced on a front-end page. Heartbeat polls drain server CPU on busy sites.",
      fix: {
        generic: "Disable admin-only features on public pages.",
        techCause:
          "Some plugins (and the Heartbeat API) load admin-ajax even for logged-out visitors.",
        techFix:
          "Use Heartbeat Control plugin or wp_deregister_script('heartbeat') on the front-end.",
      },
    });
  }

  void headers;
  return out;
}

// ────────────────────────────────────────────────────────────────────────
// React / Next.js / Gatsby / Nuxt
// ────────────────────────────────────────────────────────────────────────

function reactStackChecks(
  url: string,
  html: string,
  headers: Headers,
  tech: TechContext,
): TechFinding[] {
  const out: TechFinding[] = [];

  const stackName = tech.isNextJs
    ? "Next.js"
    : tech.isGatsby
      ? "Gatsby"
      : tech.isNuxt
        ? "Nuxt"
        : "React";

  // 1. Empty <body> or near-empty (SPA shell)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch?.[1] ?? "";
  const stripped = bodyContent
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length < 200 && bodyContent.length > 500) {
    out.push({
      type: "spa_empty_body",
      severity: "high",
      url,
      tech: stackName,
      message: `${stackName} app ships a near-empty <body> (${stripped.length} chars of text) — the page is rendered entirely client-side. AI crawlers (GPTBot, ClaudeBot, PerplexityBot) don't execute JS and will see a blank page.`,
      fix: {
        generic: "Render meaningful content in the initial HTML.",
        techCause: tech.isNextJs
          ? "Pages are using client components ('use client') without server-side rendering, or are CSR-only."
          : `${stackName} app is configured as client-only / SPA mode.`,
        techFix: tech.isNextJs
          ? "Move data-fetching to Server Components, or use generateStaticParams + force-static for static export. Verify with: curl -A 'GPTBot' YOUR_URL | grep TEXT_FROM_PAGE."
          : tech.isGatsby
            ? "Gatsby is static-export by default — if HTML is empty, the build is broken or page lives in a dynamic-only route. Run gatsby build && check public/ output."
            : "Switch to SSR or static export — Vite/CRA SPAs can't be properly crawled.",
      },
    });
  }

  // 2. Next.js exposes version via __NEXT_DATA__ buildId — informational
  const nextBuildId = html.match(
    /"buildId":\s*"([^"]+)"/,
  )?.[1];
  if (tech.isNextJs && nextBuildId) {
    // Not a finding — just track. Leave for future use.
    void nextBuildId;
  }

  // 3. X-Powered-By: Next.js header — version disclosure
  const poweredBy = headers.get("x-powered-by") ?? "";
  if (/Next\.js/i.test(poweredBy)) {
    out.push({
      type: "next_powered_by_header",
      severity: "low",
      url,
      tech: "Next.js",
      message:
        "X-Powered-By: Next.js header is set. Reveals stack version to scanners. Not a critical issue but tighten defaults.",
      fix: {
        generic: "Strip framework identifiers from response headers.",
        techCause: "Next.js sets X-Powered-By by default.",
        techFix:
          "In next.config.js / next.config.ts: module.exports = { poweredByHeader: false }",
      },
    });
  }

  // 4. <Image> usage check — if site uses Next.js, raw <img> is a missed optimization
  if (tech.isNextJs) {
    const rawImgCount = (html.match(/<img\s[^>]+>/gi) ?? []).length;
    const nextImageCount = (
      html.match(/<img[^>]+srcset=["'][^"']*\/_next\/image/gi) ?? []
    ).length;
    if (rawImgCount >= 5 && nextImageCount < rawImgCount / 2) {
      out.push({
        type: "next_raw_img_tags",
        severity: "medium",
        url,
        tech: "Next.js",
        message: `${rawImgCount} <img> tags but only ${nextImageCount} use next/image's optimization. You're paying for CDN bandwidth + LCP penalty needlessly.`,
        fix: {
          generic: "Use the framework's optimized image component.",
          techCause:
            "Direct <img> tags bypass Next.js automatic AVIF/WebP conversion, srcset generation, and lazy-load defaults.",
          techFix:
            'import Image from "next/image"; <Image src="…" width={…} height={…} alt="…" />',
        },
      });
    }
  }

  // 5. _next/static chunk count — too many chunks suggests aggressive code-split
  const chunks = html.match(/\/_next\/static\/chunks\/[^"']+\.js/gi) ?? [];
  const uniqueChunks = new Set(chunks).size;
  if (tech.isNextJs && uniqueChunks > 30) {
    out.push({
      type: "next_chunk_explosion",
      severity: "low",
      url,
      tech: "Next.js",
      message: `${uniqueChunks} JS chunks loaded — code-splitting is great, but >30 chunks on a single page suggests fragmentation hurting TTI. Review your dynamic imports.`,
      fix: {
        generic: "Keep the number of round-trips to a reasonable count.",
        techCause:
          "Over-aggressive dynamic imports or one-component-per-chunk patterns.",
        techFix:
          "Use webpack-bundle-analyzer / next build --debug. Combine related dynamic imports into the same boundary.",
      },
    });
  }

  return out;
}

// ────────────────────────────────────────────────────────────────────────
// Shopify
// ────────────────────────────────────────────────────────────────────────

function shopifyChecks(
  url: string,
  html: string,
  _headers: Headers,
): TechFinding[] {
  const out: TechFinding[] = [];

  // 1. Default Shopify product URLs include /products/ — informational
  //    but check for /collections/all (the noindex-by-default catch-all)
  if (/\/collections\/all/i.test(url)) {
    out.push({
      type: "shopify_collections_all",
      severity: "low",
      url,
      tech: "Shopify",
      message:
        "/collections/all is a duplicate of every product. Shopify noindexes it by default — confirm it's still noindex, or canonical to a primary category.",
      fix: {
        generic: "Don't index duplicate catch-all listing pages.",
        techCause:
          "Shopify auto-generates /collections/all listing every product.",
        techFix:
          "In theme.liquid: <meta name='robots' content='noindex,follow'> when {%- if collection.handle == 'all' -%}.",
      },
    });
  }

  // 2. Liquid debug comments left in HTML
  if (/<!--\s*Liquid (debug|error)/i.test(html)) {
    out.push({
      type: "shopify_liquid_debug",
      severity: "medium",
      url,
      tech: "Shopify",
      message:
        "Liquid debug/error comments are present in the HTML. Theme has unresolved Liquid errors that may also break SEO output (titles, meta, schema).",
      fix: {
        generic: "Fix template errors before launch.",
        techCause: "Shopify renders Liquid errors as HTML comments.",
        techFix:
          "Open Theme editor → Code editor, check the template emitting the error. Run shopify theme check locally.",
      },
    });
  }

  return out;
}
