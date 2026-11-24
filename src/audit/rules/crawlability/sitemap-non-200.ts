import { defineRule, fail, notMeasured, pass, warn } from "@/audit/engine/define-rule";

export const MAX_LISTED2 = 10;
export const sitemapNon200Rule = defineRule({
  id: "crawl-sitemap-non-200",
  name: "Non-200 URLs in Sitemap",
  description: "Cross-references sitemap URLs against crawled status codes; fails on 4xx/5xx, warns on 3xx and timed-out URLs",
  category: "crawl",
  weight: 10,
  run: (context) => {
    const site = context.site;
    const pages = site?.pages;
    const sitemapUrls = context.sitemapUrls;
    if (!site || !pages) {
      return notMeasured(
        "crawl-sitemap-non-200",
        "Per-page crawl data needs a multi-page crawl - only available in a site audit, not a single-page check"
      );
    }
    if (!sitemapUrls || sitemapUrls.length === 0) {
      return notMeasured(
        "crawl-sitemap-non-200",
        "No sitemap URLs available to cross-reference against crawled status codes"
      );
    }
    const serverErrors = [];
    const clientErrors = [];
    const redirects = [];
    const timedOut = [];
    let checked = 0;
    let notCrawled = 0;
    for (const url of sitemapUrls) {
      const info = pages.get(site.normalize(url));
      if (!info) {
        notCrawled++;
        continue;
      }
      checked++;
      const status = info.statusCode;
      if (status === 0) {
        timedOut.push(url);
      } else if (status >= 500) {
        serverErrors.push({ url, statusCode: status });
      } else if (status >= 400) {
        clientErrors.push({ url, statusCode: status });
      } else if (status >= 300) {
        redirects.push({ url, statusCode: status });
      }
    }
    const details = {
      sitemapUrlCount: sitemapUrls.length,
      checkedCount: checked,
      notCrawledCount: notCrawled,
      serverErrorCount: serverErrors.length,
      clientErrorCount: clientErrors.length,
      forbiddenCount: clientErrors.filter((e) => e.statusCode === 403).length,
      redirectCount: redirects.length,
      timedOutCount: timedOut.length,
      serverErrors: serverErrors.slice(0, MAX_LISTED2),
      clientErrors: clientErrors.slice(0, MAX_LISTED2),
      redirects: redirects.slice(0, MAX_LISTED2),
      timedOutUrls: timedOut.slice(0, MAX_LISTED2)
    };
    if (serverErrors.length > 0 || clientErrors.length > 0) {
      const total = serverErrors.length + clientErrors.length;
      return fail(
        "crawl-sitemap-non-200",
        `${total} sitemap URL(s) return an error status (${serverErrors.length} 5xx, ${clientErrors.length} 4xx)`,
        {
          ...details,
          impact: "Erroring URLs in the sitemap waste crawl budget and signal poor site quality to search engines.",
          recommendation: "Remove erroring URLs from the sitemap or fix the underlying responses."
        }
      );
    }
    if (redirects.length > 0 || timedOut.length > 0) {
      return warn(
        "crawl-sitemap-non-200",
        `${redirects.length} sitemap URL(s) redirect (3xx) and ${timedOut.length} timed out during the crawl`,
        {
          ...details,
          impact: "Sitemaps should list final destination URLs; redirects and timeouts waste crawl budget.",
          recommendation: "Replace redirected URLs with their final targets and investigate timed-out pages."
        }
      );
    }
    return pass(
      "crawl-sitemap-non-200",
      `All ${checked} crawled sitemap URLs return a success status`,
      details
    );
  }
});
