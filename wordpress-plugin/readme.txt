=== SEO Tool Bridge ===
Contributors: dicecodes
Tags: seo, ai, automation, meta tags, schema, yoast, rank math
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 8.0
Stable tag: 0.5.0
License: MIT
License URI: https://opensource.org/licenses/MIT

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

* Send any data anywhere on its own — only responds to requests authenticated with your connection key
* Track users or collect analytics
* Phone home in any way

= What it changes in your post content =

Everything above edits metadata — titles, descriptions, alt text, schema — except one thing. Since 0.3.0 the plugin can insert internal links into a post's body, which is the only feature that rewrites the article itself.

It is deliberately conservative: anchors are matched in visible text only (never inside an existing link, heading, or code block), the first occurrence only, once per phrase, and same-site URLs only. The entire previous body is saved, so undo restores the article exactly.

If you would rather it never touched your content, leave the SEO Tool's autonomy on "suggest only" and approve each change yourself.

(Earlier versions of this readme said the plugin does not modify post content. That stopped being true in 0.3.0.)

= How the auth works =

A 48-character random connection key is generated when you activate the plugin. Send it in either header:

    X-STB-Key: <key>
    Authorization: Bearer <key>

The SEO Tool uses `X-STB-Key`, which is also the one to prefer if you're calling the API yourself: Apache with mod_php often strips `Authorization` before PHP can read it unless the site owner adds a rewrite rule.

The plugin verifies with `hash_equals()` (timing-safe). Anyone without the key gets `401 Unauthorized` from every endpoint except the WP admin UI.

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
3. Test the endpoint manually: `curl -H "X-STB-Key: YOUR_KEY" https://yoursite.com/wp-json/seo-tool/v1/ping`
4. Should return JSON with `"ok":true` and your `plugin_version`
5. If that returns 401 and you are on 0.3.0 or older, upgrade — before 0.4.0 the plugin only read the `Authorization` header while the SEO Tool only ever sent `X-STB-Key`, so every request failed no matter how correct the key was

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

= 0.5.0 (current) =
* Added: canonical URL and per-page robots directives are now readable and
  writable. Both fields were already in the SEO Tool's request format and this
  plugin read neither, so sending one was accepted, ignored, and answered with
  success — two "apply fix" buttons reported changes that never happened.
* Added: robots.txt management, served through WordPress's own robots_txt
  filter. If a real robots.txt file exists on disk WordPress serves that and
  ignores every plugin, so the endpoint refuses the write and says why rather
  than reporting a success you could only disprove by loading the URL.
* Added: 301/302/307/308 redirects. Applied on template_redirect and only where
  WordPress found nothing, so a rule can never shadow a page that exists.
  Self-referencing rules are dropped rather than stored — they become
  ERR_TOO_MANY_REDIRECTS on a live page.
* Added: hardening toggles — disable XML-RPC, hide the WordPress version, drop
  REST discovery links, remove the emoji script, stop the front-end heartbeat,
  noindex author archives. All default to off, so installing this plugin still
  changes nothing about how the site behaves.
* Added: undo now covers site-wide changes. The revision log's object field
  required a numeric id, so every site-level change would have been refused as
  unidentifiable while the SEO Tool still offered the undo button.
* Note: none of this writes to disk. Everything above is stored in WordPress
  options and applied through filters, so deactivating the plugin reverts all
  of it at once and leaves no edited files behind.

= 0.4.0 =
* Fixed (Critical): authentication accepted only `Authorization: Bearer`, while
  the SEO Tool has only ever sent `X-STB-Key`. Every request from the tool
  returned 401, for every endpoint, in every version of this plugin — and a 401
  reads as a wrong key, which is what anyone debugging it would have chased.
  Both headers are now accepted; `X-STB-Key` is preferred because Apache with
  mod_php frequently strips `Authorization` before PHP sees it.
* Fixed: revision ids were `count($revisions) + 1`, and the log is capped at the
  most recent 500 — so past 500 changes every new revision was id 501. Undo
  found the oldest 501 and restored a value from hundreds of edits ago to a live
  site, reporting success. Ids are now monotonic.
* Fixed: an empty `jsonld` is now how you REMOVE schema, instead of a 400. Undo
  of "schema added" replays the previous value, which is always empty — so the
  SEO Tool could add structured data to a page and never take it off.
* Fixed: the literal JSON `null` was accepted as schema and printed
  `<script type="application/ld+json">null</script>` into the page. Non-object
  JSON (a bare number or string) is refused for the same reason.
* Fixed: `/ping` advertised a `redirects` capability that has never had a route.
  Capabilities now match reality, and `canonical`/`robots` are declared false.
* Changed: License to MIT, matching the main project's LICENSE. The old
  PolyForm Noncommercial header was not GPL-compatible, so the plugin could
  never have been submitted to the WordPress.org directory.
* Changed: `Stable tag` was still 0.2.1 while the plugin was 0.3.0.
* Fixed: internal linking reported "already linked" for any phrase whose whole
  text sat inside a tag — `<li>pricing</li>`, `<code>`, `<strong>`, a table
  cell. A word appearing in a list anywhere on the page could therefore never
  be linked, and the reason given was untrue. Detection now walks the markup
  and answers on whether the phrase is genuinely inside an `<a>`.
* Fixed: the revision table in wp-admin rendered timestamps in the server's
  timezone rather than the site's — on managed hosts, usually UTC, so a change
  made at 9am read as 4am.
* Fixed: undo now refuses a revision whose object reference is unreadable
  instead of undoing against object 0.
* Docs: corrected "does not modify post content" — link insertion, added in
  0.3.0, does.

= 0.3.0 =
* Added: `GET /post/{id}/images` — every image on a post with its attachment id.
  `/attachment/{id}/alt` had always existed, but nothing could map an image on a
  page to its media-library entry, so the SEO Tool could find images missing alt
  text and never fix one.
* Added: `GET /post/{id}/schema` — read the JSON-LD this plugin manages, so an
  update can check before overwriting instead of destroying existing markup.
  Deliberately does not report schema from Yoast, Rank Math or your theme.
* Added: `POST /post/{id}/links` — insert internal links into post content.
  Visible text only, first occurrence, never inside an existing link, heading or
  code block, same-site URLs only, whole-body revision so undo is exact.
* Added: `content` case in the undo handler, for the above.

= 0.2.1 =
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

= 0.4.0 =
Upgrade immediately. Before this release the plugin never accepted a single request from the SEO Tool — it read the wrong header, so every call returned 401 regardless of the key. Also fixes undo restoring the wrong value on sites with more than 500 logged changes. No breaking changes; the previously documented `Authorization: Bearer` header still works.

= 0.2.0 =
Important bug fix: GET on `/post/{id}/seo` was broken in 0.1.0 due to duplicate route registration. Upgrade to fix one-click "read current SEO" in the SEO Tool. No breaking changes.
