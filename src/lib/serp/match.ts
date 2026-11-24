/**
 * Finding a domain's position in a list of result URLs.
 *
 * Every rank source ends in the same question: given the results in
 * order, where is this domain? Google's HTML, SearXNG's JSON and Brave's
 * JSON differ completely in how you get the list and not at all in what
 * you do with it.
 *
 * This lives in one place because the alternative is three copies of a
 * host comparison, and a host comparison is exactly the kind of thing
 * that drifts: one copy strips `www.`, another doesn't, and the same
 * site ranks #3 on one screen and "not ranking" on another.
 * `rank-checker.ts` imports it rather than keeping the private
 * `urlMatches` it used to have.
 */

/**
 * Does this URL belong to the domain we are tracking?
 *
 * Subdomains count — `blog.example.com` is still the client's site.
 * Lookalikes do not: `notexample.com` must never match `example.com`,
 * which a naive `includes()` gets wrong.
 */
export function urlMatchesDomain(href: string, domain: string): boolean {
  const target = domain.replace(/^www\./i, "").toLowerCase();
  if (!target) return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./i, "").toLowerCase();
    return host === target || host.endsWith("." + target);
  } catch {
    return false;
  }
}

/**
 * 1-indexed position of the first result belonging to `domain`, or null.
 *
 * The caller supplies the list already deduped and in rank order; what
 * counts as "one result" differs per source and is their problem. For
 * the Google scraper that distinction was a real bug once — counting
 * raw anchors made a genuine #3 report as #9 — so it is deliberately
 * not re-litigated here.
 */
export function positionOf(
  urls: readonly string[],
  domain: string,
): { position: number; url: string } | null {
  for (let i = 0; i < urls.length; i++) {
    if (urlMatchesDomain(urls[i], domain)) {
      return { position: i + 1, url: urls[i] };
    }
  }
  return null;
}
