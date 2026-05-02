=== SEO Tool Bridge ===
Contributors: seotool
Tags: seo, ai, automation, meta tags, schema
Requires at least: 6.0
Tested up to: 6.6
Requires PHP: 8.0
Stable tag: 0.1.0
License: AGPL-3.0
License URI: https://www.gnu.org/licenses/agpl-3.0.html

Connects your WordPress site to a self-hosted SEO Tool so AI suggestions can be applied with one click.

== Description ==

When you're using the [SEO Tool](https://github.com/your-org/seo-tool) — a free, self-hostable SEO platform — this plugin lets the tool's AI agent push title, meta description, alt text, and schema markup changes directly to your site without copy-paste.

Every change is logged with the previous value; one-click undo on any change.

= What it does =

* Read + write post / page / product titles
* Read + write meta descriptions (Yoast / Rank Math / All in One SEO compatible)
* Update image alt text in the Media Library
* Inject custom JSON-LD schema markup into `<head>`
* List all your pages for batch SEO operations
* Revision log of every change with one-click undo

= What it does NOT do =

* Send any data anywhere on its own — only responds to requests authenticated with your unique connection key
* Modify content (only metadata + structural fixes)
* Track users or analytics

= Privacy =

This plugin doesn't phone home. It exposes a REST API endpoint that only your SEO Tool instance can authenticate against.

== Installation ==

1. Upload `seo-tool-bridge` to `/wp-content/plugins/`
2. Activate the plugin in WordPress admin
3. Go to **Tools → SEO Tool Bridge**
4. Copy the REST endpoint + connection key
5. Paste them into your SEO Tool's CMS connections settings

== Frequently Asked Questions ==

= Can I use this with Yoast / Rank Math / AIOSEO already installed? =

Yes. The plugin writes meta descriptions to all three plugins' meta keys, so it works regardless of which SEO plugin you have active.

= What if I don't have a SEO plugin? =

Meta descriptions are saved as standard post meta and rendered into `<head>` only if your theme reads them, or if you install Yoast/Rank Math/AIOSEO later.

= How do I revoke access? =

Tools → SEO Tool Bridge → Regenerate key. The old key stops working immediately.

== Changelog ==

= 0.1.0 =
* Initial release: title, meta description, alt text, schema markup, redirects, revision log + undo.
