/**
 * Paths that are infrastructure rather than pages.
 *
 * `/cdn-cgi/` is Cloudflare's reserved namespace. The one that bites is
 * email obfuscation: with it enabled, Cloudflare rewrites every mailto
 * in the HTML into a link to `/cdn-cgi/l/email-protection#<hex>`, which
 * returns 404 when fetched without the fragment — and fragments are not
 * sent to servers.
 *
 * So crawling it produced three findings on a perfectly healthy site:
 * bad_status (404), noindex_set, and missing_meta_description, two of
 * them marked critical, all pointing at a URL the site owner has never
 * heard of and cannot fix. That is a false positive on a large share of
 * the web, since Cloudflare fronts a lot of it and most sites list an
 * email address.
 *
 * Google does not index these either. Skipping them loses nothing.
 *
 * Its own module rather than part of the crawler, because everything
 * that walks links needs it, and importing it from `audit.ts` pulls the
 * whole crawler and the Playwright browser pool along behind it. The
 * generated capability table noticed exactly that when keyword
 * discovery started using this: a keyword read is not a browser job and
 * should not be marked as one.
 */
const INFRASTRUCTURE_PATHS = [
  "/cdn-cgi/",
  // Cloudflare Rocket Loader and friends live here too.
  "/cdn-cgi/scripts/",
  // WordPress admin-ajax is an endpoint, not a page, and themes link to
  // it. It answers 400 to a GET with no action parameter.
  "/wp-admin/admin-ajax.php",
  "/wp-json/",
  "/xmlrpc.php",
];

/** Is this URL plumbing rather than a page a person could visit? */
export function isInfrastructureUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return INFRASTRUCTURE_PATHS.some((p) => path.startsWith(p));
}
