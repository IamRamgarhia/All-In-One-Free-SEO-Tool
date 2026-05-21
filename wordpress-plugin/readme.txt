=== SEO Tool Bridge ===
Contributors: dicecodes
Tags: seo, ai, automation, meta tags, schema, yoast, rank math
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.2.1
License: PolyForm Noncommercial 1.0.0
License URI: https://polyformproject.org/licenses/noncommercial/1.0.0/

Connects your WordPress site to the self-hosted SEO Tool by DiceCodes so AI-generated SEO fixes can be applied with one click.

== Description ==

When you're using the [SEO Tool](https://github.com/IamRamgarhia/SEO-Tool) — a free, self-hostable SEO platform — this plugin lets the tool's AI agent push title, meta description, alt text, and schema markup changes directly to your WordPress site without copy-paste.

Every change is logged with the previous value, and one-click undo works on any change.

= What it does =

* Read + write post / page / product / CPT titles
* Read + write meta descriptions (Yoast / Rank Math / All in One SEO compatible — writes to all three meta keys so it sticks regardless of which plugin is active)
* Update image alt text in the Media Library
* Inject custom JSON-LD schema markup into &lt;head&gt; on singular pages
* List + look up posts by public URL (used by the SEO Tool's one-click fix flow — you provide a URL, the plugin resolves it to a post ID)
* Create new posts (draft or published) — used by the SEO Tool's daily AI agent when a blog draft is approved
* Full revision log with one-click undo on every change

= What it does NOT do =

* Send any data anywhere on its own — only responds to requests authenticated with your unique Bearer-token connection key
* Modify post content (only metadata + structural fixes)
* Track users or collect analytics
* Phone home in any way

= How the auth works =

A 48-character random connection key is generated when you activate the plugin. The SEO Tool sends this as a Bearer token (`Authorization: Bearer <key>`) on every request. The plugin verifies with `hash_equals()` (timing-safe). Anyone without the key gets `401 Unauthorized` from every endpoint except the WP admin UI.

You can regenerate the key at any time from `Tools → SEO Tool Bridge → Regenerate key`. The old key stops working immediately.

= Compatibility =

* PHP 8.0+ required
* WordPress 6.0+
* Works with classic editor + Gutenberg
* Works with WooCommerce products (uses standard post type endpoints)
* Works with custom post types (pass `type` query param to `/posts/list`)
* Compatible SEO plugins: Yoast SEO, Rank Math, All in One SEO Pack (legacy + current)

== Installation ==

1. Download the plugin folder from <https://github.com/IamRamgarhia/SEO-Tool/tree/main/wordpress-plugin>
2. Upload `seo-tool-bridge` to `/wp-content/plugins/` (or zip it and use Plugins → Add New → Upload)
3. Activate the plugin in WordPress admin (Plugins → Installed Plugins)
4. Go to **Tools → SEO Tool Bridge** in the WP admin sidebar
5. Copy the **REST endpoint URL** (looks like `https://yoursite.com/wp-json/seo-tool/v1`)
6. Copy the **Connection key** (48 random characters)
7. In your SEO Tool, go to **Settings → CMS connections → WordPress**
8. Paste both values, click Save
9. The SEO Tool will ping the plugin to verify the connection — you'll see a green "Connected" badge

= Verifying it works =

After connecting, from the SEO Tool dashboard:

* Open any client whose site has the plugin installed
* Run an audit
* Click any "Fix it for me" wizard (e.g., "Title too long")
* Pick a suggested rewrite, hit Apply
* Watch your WP site's title update in real time (refresh the page to confirm)

If you see "Failed to connect to WordPress bridge":

1. Check the REST endpoint URL matches exactly what the plugin shows in Tools → SEO Tool Bridge
2. Check your hosting doesn't block `/wp-json/` requests (some security plugins do — whitelist `seo-tool/v1` namespace)
3. Test the endpoint manually: `curl -H "Authorization: Bearer YOUR_KEY" https://yoursite.com/wp-json/seo-tool/v1/ping`
4. Should return JSON with `"ok":true`

== Frequently Asked Questions ==

= Can I use this with Yoast / Rank Math / All in One SEO already installed? =

Yes. The plugin writes meta descriptions to all three plugins' meta keys, so it works regardless of which SEO plugin is active.

= What if I don't have any SEO plugin? =

Meta descriptions are saved as standard post meta and the plugin doesn't render them on the front-end on its own. Install Yoast, Rank Math, or All in One SEO (any of them — they're free) so the meta description appears in &lt;head&gt;.

= How do I revoke access? =

Tools → SEO Tool Bridge → Regenerate key. The old key stops working immediately. You'll need to paste the new key into the SEO Tool's settings.

= Does this work with multisite? =

Per-site activation works fine. Network activation isn't tested — recommended to activate per-site.

= Will updates from the SEO Tool overwrite manual edits I make in the WP editor? =

No. The plugin only updates fields when the SEO Tool explicitly sends an update request. If you edit a title manually in WP, then run a SEO Tool audit later, the tool will SEE your manual title but won't overwrite it until you click "Apply this suggestion" on a recommendation.

= Is there a rate limit? =

No. The plugin is designed for occasional batched writes from the SEO Tool, not high-traffic public API use. If you do hit performance issues, file an issue on the SEO Tool repo.

= Where is the revision data stored? =

In a single WP option (`stb_revisions`), capped at the most recent 500 revisions to keep the options table small.

= Is this GDPR-compliant? =

The plugin doesn't collect or transmit any personal data. It exposes a REST endpoint that only your own SEO Tool instance authenticates against using a key you control. Audit the source at <https://github.com/IamRamgarhia/SEO-Tool/tree/main/wordpress-plugin>.

== Changelog ==

= 0.2.1 (current) =
* SECURITY (Critical): XSS — JSON-LD output was interpolated unescaped into the
  &lt;script&gt; block, allowing a bridge-key holder to inject arbitrary JS into
  every visitor's session via a `</script>` payload. Output now escapes
  `</script` sequences before render.
* Fixed: stb_rest_set_schema no longer runs wp_kses_post() on JSON-LD
  (it was stripping characters that are legitimate inside JSON strings,
  corrupting valid schema). Replaced with json_decode() validation.

= 0.2.0 =
* Added: Create-post endpoint (used by SEO Tool's daily AI agent for approved blog drafts)
* Added: Find-by-URL endpoint (resolves a public URL to a post ID for one-click fixes)
* Fixed: Duplicate route registration for GET + POST on `/post/{id}/seo` (POST was shadowing GET in some WP versions)
* Fixed: Author + Plugin URI metadata (was placeholder)
* Changed: License to PolyForm Noncommercial 1.0.0 (matches the main SEO Tool project)
* Improved: Admin page accurately lists current capabilities

= 0.1.0 =
* Initial release: title, meta description, alt text, schema markup, revision log + undo

== Upgrade Notice ==

= 0.2.0 =
Important bug fix: GET on `/post/{id}/seo` was broken in 0.1.0 due to duplicate route registration. Upgrade to fix one-click "read current SEO" in the SEO Tool. No breaking changes.
