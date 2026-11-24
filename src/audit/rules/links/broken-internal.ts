import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { fetchUrl } from "@/audit/crawler/fetcher";
import { internalLinkTargets } from "@/audit/rules/links/link-targets";
import { rethrowIfAborted } from "@/audit/engine/errors";

export const brokenInternalRule = defineRule({
  id: "links-broken-internal",
  name: "No Broken Internal Links",
  description: "Checks that all internal links return HTTP 200 status codes",
  category: "links",
  weight: 1,
  run: async (context) => {
    const { links } = context;
    const internalLinks = links.filter((link) => link.isInternal);
    if (internalLinks.length === 0) {
      return pass(
        "links-broken-internal",
        "No internal links found to check",
        { totalLinks: 0 }
      );
    }
    const targets = internalLinkTargets(links, context.url);
    const brokenLinks = [];
    const uncheckedLinks = [];
    for (const href of targets) {
      let statusCode;
      try {
        statusCode = await fetchUrl(href, 1e4, context.signal);
      } catch (error) {
        rethrowIfAborted(error, context.signal);
        statusCode = 0;
      }
      // 429 (too many requests) and 503 say the site is slowing us down,
      // not that the page is gone: unchecked, never broken. Same rule as
      // the crawler's own check (lib/audit.ts, isThrottled).
      if (statusCode === 0 || statusCode === 429 || statusCode === 503) {
        uncheckedLinks.push(href);
      } else if (statusCode === 404 || statusCode === 410 || statusCode >= 500) {
        brokenLinks.push({ href, statusCode });
      }
    }
    const details = {
      totalChecked: targets.length,
      totalLinks: internalLinks.length,
      ...uncheckedLinks.length > 0 && {
        uncheckedCount: uncheckedLinks.length,
        uncheckedLinks: uncheckedLinks.slice(0, 10)
      }
    };
    if (brokenLinks.length > 0) {
      return fail(
        "links-broken-internal",
        `Found ${brokenLinks.length} broken internal link(s) out of ${targets.length}`,
        {
          ...details,
          brokenCount: brokenLinks.length,
          brokenLinks: brokenLinks.slice(0, 10)
          // Limit to first 10
        }
      );
    }
    if (uncheckedLinks.length > 0) {
      return warn(
        "links-broken-internal",
        `No broken internal links found, but ${uncheckedLinks.length} of ${targets.length} could not be checked (timeout, network error or the site slowed our requests down)`,
        details
      );
    }
    return pass(
      "links-broken-internal",
      `All ${targets.length} internal link(s) are accessible`,
      details
    );
  }
});
