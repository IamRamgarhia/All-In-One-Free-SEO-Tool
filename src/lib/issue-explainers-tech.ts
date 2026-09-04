import type { IssueExplainer } from "./issue-explainers";

/**
 * Fix guides for the tech-stack checks in tech-audit-rules.ts.
 *
 * All sixteen shipped with no guide at all — the audit told people their
 * WordPress or Shopify site had a problem and then said "we haven't
 * written the fix guide for this check yet". The drift test that exists
 * to prevent exactly that only read lib/audit.ts, so a whole file of
 * findings walked past it.
 *
 * Kept in its own file because these are platform-specific and will grow
 * per platform, while issue-explainers.ts stays about the generic
 * crawler findings.
 *
 * On the snippets: every one names the file and the position, and every
 * one says how to undo it. Handing somebody PHP with no more than "add
 * this" is how a working site goes down — functions.php in particular
 * white-screens the whole install on a syntax error, which is why the
 * WordPress entries say to use a child theme or a snippets plugin rather
 * than editing a parent theme directly.
 */
export const TECH_ISSUE_EXPLAINERS: Record<string, IssueExplainer> = {
  wp_default_permalinks: {
    whatIsIt:
      "Your pages are reachable at /?p=123 instead of /a-readable-slug/. That's WordPress's default permalink setting, which nobody changed after install.",
    whyItMatters:
      "The URL is one of the few places you fully control what a page is about, and Google shows it in results. /?p=123 says nothing to a person deciding whether to click, and nothing to a search engine about the topic.",
    howToFix: [
      "Settings → Permalinks → choose Post name → Save.",
      "WordPress writes the redirects for you, so existing links keep working.",
      "If anything was hard-coded to /?p=… elsewhere, update it — the old form still resolves, but it will not be what Google indexes.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/url-structure",
  },

  wp_version_disclosed: {
    whatIsIt:
      "Your WordPress version number is printed in the page source, in a <meta name=\"generator\"> tag.",
    whyItMatters:
      "It does not affect ranking at all. It tells anyone scanning which version you run, so a known vulnerability in that version can be tried directly rather than guessed at.",
    howToFix: [
      "Remove the generator tag.",
      "This is not a substitute for updating WordPress — it only stops advertising the version.",
    ],
    confidence: "probably",
    snippet: {
      language: "php",
      where:
        "Your child theme's functions.php, at the end. If you have no child theme, use a snippets plugin (WPCode, Code Snippets) instead — edits to a parent theme are erased by its next update.",
      code: `// Stop printing the WordPress version in the page source.
remove_action( 'wp_head', 'wp_generator' );`,
      undo: "Delete the line and save; the tag comes straight back.",
      caution:
        "Never edit functions.php from Appearance → Theme Editor on a live site. A typo there white-screens the whole install, admin included. Edit via SFTP or a snippets plugin, so you can undo it if the site stops responding.",
    },
  },

  wp_xmlrpc_exposed: {
    whatIsIt:
      "xmlrpc.php is reachable and advertised. It is the old remote-publishing interface, from before the REST API.",
    whyItMatters:
      "No SEO effect. It is a favourite target for brute-force and DDoS amplification because one request can carry many login attempts. Most sites in 2026 do not use it for anything.",
    howToFix: [
      "Check first whether anything needs it: the Jetpack app, some older mobile publishing apps, and a few backup plugins do.",
      "If nothing does, disable it.",
      "Re-test the things that connect to your site afterwards.",
    ],
    confidence: "probably",
    snippet: {
      language: "php",
      where:
        "Child theme functions.php, or a snippets plugin. Do not put this in a parent theme.",
      code: `// Turn off the legacy XML-RPC interface.
add_filter( 'xmlrpc_enabled', '__return_false' );

// Also drop the RSD link that advertises it.
remove_action( 'wp_head', 'rsd_link' );`,
      undo: "Remove both lines. Nothing else changes.",
      caution:
        "If you use the Jetpack mobile app or publish from an external client, this will break that connection. Test before leaving it in place.",
    },
  },

  wp_multiple_seo_plugins: {
    whatIsIt:
      "More than one SEO plugin is active — for example Yoast and Rank Math together.",
    whyItMatters:
      "This one does affect search. Two plugins both writing the title, the meta description, the canonical and the schema means duplicate and contradictory tags, and two sitemaps disagreeing about what exists. Google picks whichever it likes, which may not be the one you configured.",
    howToFix: [
      "Decide which one you are keeping.",
      "Export the settings from the one you are removing — most have an importer for the other, so titles and descriptions carry over.",
      "Deactivate, then delete the loser. Deactivating alone leaves its data behind.",
      "Re-crawl afterwards and confirm one title and one canonical per page.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  },

  wp_plugin_bloat: {
    whatIsIt:
      "A lot of distinct plugins are loading CSS and JavaScript on this page.",
    whyItMatters:
      "Plugins are the usual reason a WordPress page is slow, and speed is a ranking signal through Core Web Vitals. Most plugins load their assets on every page, including the ones that do not use them.",
    howToFix: [
      "List active plugins and mark the ones you would notice missing.",
      "Deactivate the rest one at a time, checking the site after each.",
      "For the ones you keep, use an asset manager (Perfmatters, Asset CleanUp) to load each only where it is used — a contact-form script does not belong on every blog post.",
      "Re-run Core Web Vitals afterwards to see whether it moved.",
    ],
    confidence: "probably",
    googleDoc: "https://developers.google.com/search/docs/appearance/page-experience",
  },

  wp_emoji_bloat: {
    whatIsIt:
      "WordPress's emoji script is loading. It exists to render emoji consistently on browsers from around 2015.",
    whyItMatters:
      "Small but free to remove: an extra request and a render-blocking inline script on every page. Every modern browser renders emoji natively.",
    howToFix: [
      "Remove the emoji scripts and styles.",
      "Emoji still work — the browser draws them.",
    ],
    confidence: "probably",
    snippet: {
      language: "php",
      where: "Child theme functions.php, or a snippets plugin.",
      code: `// Drop the emoji polyfill — browsers handle emoji themselves now.
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
remove_action( 'admin_print_scripts', 'print_emoji_detection_script' );
remove_action( 'admin_print_styles', 'print_emoji_styles' );`,
      undo: "Delete the block. The script returns on the next page load.",
    },
  },

  wp_missing_block_styles: {
    whatIsIt:
      "The page uses block-editor blocks but the block library stylesheet is not being loaded.",
    whyItMatters:
      "Not an SEO issue directly — it is a layout one. Columns, galleries and buttons fall back to unstyled markup for anyone whose browser has not cached the CSS, which usually means first-time visitors.",
    howToFix: [
      "Look at the page in a private window, which has no cache. If it looks wrong, that is what your new visitors see.",
      "Check whether an optimisation plugin is set to 'remove unused CSS' or 'disable block styles' — that is almost always the cause.",
      "Exclude wp-block-library from that rule rather than turning the whole optimisation off.",
    ],
    confidence: "probably",
  },

  wp_rest_api_advertised: {
    whatIsIt:
      "The REST API endpoint is advertised in the page head, at /wp-json/.",
    whyItMatters:
      "No search impact. The reason to care is /wp-json/wp/v2/users, which by default lists the usernames of everyone who has published — the half of a login an attacker would otherwise have to guess.",
    howToFix: [
      "Leave the API on if anything uses it — the block editor does, and so does any headless front end.",
      "Restrict the users endpoint to logged-in requests, which is the part worth closing.",
    ],
    confidence: "probably",
    snippet: {
      language: "php",
      where: "Child theme functions.php, or a snippets plugin.",
      code: `// Require authentication for the user-listing endpoints only.
// The rest of the REST API keeps working, including the editor.
add_filter( 'rest_authentication_errors', function ( $result ) {
    if ( ! empty( $result ) ) {
        return $result;
    }
    $route = $GLOBALS['wp']->query_vars['rest_route'] ?? '';
    if ( str_starts_with( $route, '/wp/v2/users' ) && ! is_user_logged_in() ) {
        return new WP_Error(
            'rest_forbidden',
            'Authentication required.',
            array( 'status' => 401 )
        );
    }
    return $result;
} );`,
      undo: "Remove the block; the endpoint is public again immediately.",
      caution:
        "Blocking the whole REST API instead of just this endpoint breaks the block editor and many plugins. This deliberately narrows to /wp/v2/users for that reason.",
    },
  },

  wp_author_archive_indexed: {
    whatIsIt:
      "Your author archive pages (/author/name/) can be indexed by Google.",
    whyItMatters:
      "On a one-author site the author archive is a near-copy of the blog index — two URLs competing to rank for the same content. On multi-author sites they are usually thin. Neither is what you want ranking.",
    howToFix: [
      "One author: noindex author archives, or disable them entirely.",
      "Several authors who are genuinely a draw — named experts, bylines readers follow — keep them and make them worth indexing with a real bio and credentials. That also supports E-E-A-T.",
      "Your SEO plugin has this setting: Yoast under Search Appearance → Archives, Rank Math under Titles & Meta → Misc Pages.",
    ],
    confidence: "probably",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/block-indexing",
  },

  wp_heartbeat_on_frontend: {
    whatIsIt:
      "admin-ajax.php is being called from a public page — that is the WordPress Heartbeat API polling in the background.",
    whyItMatters:
      "It exists for the admin: autosave, post locking, session checks. On a public page it is a repeating request per visitor that does nothing for them, and on a busy site that is real CPU on your server.",
    howToFix: [
      "Turn Heartbeat off on the front end and keep it in the editor, where it does useful work.",
    ],
    confidence: "probably",
    snippet: {
      language: "php",
      where: "Child theme functions.php, or a snippets plugin.",
      code: `// Heartbeat is an admin feature. Stop it polling on public pages.
add_action( 'init', function () {
    if ( ! is_admin() ) {
        wp_deregister_script( 'heartbeat' );
    }
}, 1 );`,
      undo: "Delete the block.",
      caution:
        "Keep the is_admin() check. Deregistering Heartbeat everywhere disables autosave and post-locking in the editor, and people lose work to it.",
    },
  },

  spa_empty_body: {
    whatIsIt:
      "The HTML your server returns is essentially empty — the page is built in the browser after JavaScript runs.",
    whyItMatters:
      "Google can render JavaScript, on a delay and a budget. The AI crawlers largely cannot: GPTBot, ClaudeBot and PerplexityBot read the HTML they are given. An empty body means those see a blank page, so you are absent from AI answers regardless of how good the content is.",
    howToFix: [
      "Server-render or pre-render the pages that matter. In Next.js that means a server component or generateStaticParams rather than fetching in a client component.",
      "Check the result with JavaScript disabled — that is roughly what an AI crawler sees.",
      "Getting the title, headings and main text into the HTML is most of the benefit; interactive parts can stay client-side.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  },

  next_powered_by_header: {
    whatIsIt: "Your responses carry an X-Powered-By: Next.js header.",
    whyItMatters:
      "No ranking effect. It names your framework to anyone scanning, which narrows down what to try against you. Free to remove.",
    howToFix: ["Switch the header off in the Next.js config."],
    confidence: "probably",
    snippet: {
      language: "js",
      where:
        "next.config.js (or next.config.mjs) at the root of the project, inside the exported config object.",
      code: `const nextConfig = {
  // Stops Next.js advertising itself in every response header.
  poweredByHeader: false,
};

module.exports = nextConfig;`,
      undo: "Remove the line, or set it to true. It defaults to on.",
      caution: "Needs a rebuild and redeploy — config changes are not hot-reloaded.",
    },
  },

  next_raw_img_tags: {
    whatIsIt:
      "The page uses plain <img> tags where next/image would handle them.",
    whyItMatters:
      "next/image resizes per device, converts to modern formats and reserves the space before the image loads. Plain tags do none of that, so you serve bigger files, score worse on LCP, and shift the layout as images arrive — which is what CLS measures.",
    howToFix: [
      "Swap <img> for next/image and give width and height, or use fill inside a positioned parent.",
      "Add priority to the one image that is visible before scrolling — usually the hero. Only that one.",
      "External domains must be listed under images.remotePatterns in next.config.js or the build fails.",
    ],
    confidence: "probably",
    snippet: {
      language: "ts",
      where: "In the component file, replacing the <img> tag.",
      code: `import Image from "next/image";

// width and height are the intrinsic size. They reserve the space
// before the file arrives, which is what stops the layout jumping.
<Image
  src="/hero.jpg"
  alt="Describe what is in the image"
  width={1200}
  height={630}
  priority        // only on the image visible without scrolling
/>;`,
      undo: "Put the original <img> back; nothing else depends on the change.",
      caution:
        "Do not add priority to more than one or two images. Marking everything priority tells the browser nothing is more important than anything else, and the page gets slower rather than faster.",
    },
  },

  next_chunk_explosion: {
    whatIsIt:
      "The page loads a large number of separate JavaScript chunks.",
    whyItMatters:
      "Code splitting is good until it is not. Past roughly thirty chunks on one page, the request overhead outweighs the saving, and the page stays unresponsive for longer even though the total bytes look fine.",
    howToFix: [
      "Look for dynamic() imports on components that are visible immediately — those pay the cost of splitting with none of the benefit.",
      "Run the bundle analyser to see what is actually being split.",
      "Group small related chunks; splitting is worth it for genuinely optional or heavy things, like a chart library or an editor.",
    ],
    confidence: "test",
  },

  shopify_collections_all: {
    whatIsIt:
      "/collections/all is reachable. It lists every product in the store, so it duplicates every real collection page.",
    whyItMatters:
      "Shopify noindexes it by default, which is why this is usually nothing. It matters when a theme or an app has removed that tag — then you have one page duplicating your entire catalogue and competing with the collections you actually optimised.",
    howToFix: [
      "Open /collections/all and view source. If you see a robots noindex meta tag, nothing needs doing.",
      "If it is missing, add it back in the theme.",
    ],
    confidence: "test",
    snippet: {
      language: "liquid",
      where:
        "Online Store → Themes → Edit code → layout/theme.liquid, inside <head>. Duplicate the theme first — Actions → Duplicate — so you have something to revert to.",
      code: `{%- comment -%}
  /collections/all duplicates every product. Keep it out of the index
  while leaving real collection pages alone.
{%- endcomment -%}
{%- if collection.handle == 'all' -%}
  <meta name="robots" content="noindex, follow">
{%- endif -%}`,
      undo: "Delete the block, or publish the duplicated theme you kept.",
      caution:
        "noindex, follow rather than noindex, nofollow — you still want the links crawled through to the products.",
    },
  },

  shopify_liquid_debug: {
    whatIsIt:
      "Liquid error or debug comments are being output in the page HTML.",
    whyItMatters:
      "A Liquid error means part of the template did not render. That is often the part that writes the title, the meta description or the product schema — so the page can be missing the tags you think it has, and the error is the only visible sign.",
    howToFix: [
      "View source and search for 'Liquid error' to find which include failed.",
      "The message names the file and the line.",
      "Usually an app was removed while its snippet is still referenced, or a variable is used outside the template it exists in.",
      "After fixing, re-check the page has a title, a meta description and its product schema.",
    ],
    confidence: "definitely",
    googleDoc:
      "https://developers.google.com/search/docs/appearance/structured-data/product",
  },
};
