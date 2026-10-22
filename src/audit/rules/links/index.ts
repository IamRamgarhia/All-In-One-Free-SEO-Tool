import { defineRule, fail, pass, unmeasured, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";
import { normalizeUrl } from "@/audit/crawler/link-graph";

const GENERIC_ANCHORS = new Set([
  "click here",
  "click",
  "here",
  "read more",
  "more",
  "learn more",
  "info",
  "link",
  "this",
  "page",
  "website",
  "site",
  "go",
  "continue",
  "details",
]);

export const internalLinksPresentRule = defineRule({
  id: "links-internal-present",
  category: "links",
  severity: "medium",
  weight: 8,
  title: "Internal links present",
  description: "Page should have internal links for discovery",
  recommendation: "Add contextual internal links in the body content.",
  check: async ({ page }) => {
    const n = page.links.filter((l) => l.isInternal).length;
    if (n === 0) return warn("No internal links on this page");
    return pass(`${n} internal link(s)`, { count: n });
  },
});

export const anchorTextRule = defineRule({
  id: "links-anchor-text",
  category: "links",
  severity: "medium",
  weight: 8,
  title: "Descriptive anchor text",
  description: "Avoid empty or generic anchors like “click here”",
  recommendation: "Use descriptive anchor text that names the destination topic.",
  check: async ({ page }) => {
    const bad: Array<{ href: string; text: string; issue: string }> = [];
    for (const link of page.links) {
      const text = link.text.trim().toLowerCase();
      if (!text) {
        bad.push({ href: link.href, text: link.text, issue: "empty" });
      } else if (GENERIC_ANCHORS.has(text)) {
        bad.push({ href: link.href, text: link.text, issue: "generic" });
      }
    }
    if (bad.length === 0) return pass("Anchor text looks descriptive");
    return warn(`${bad.length} weak anchor(s)`, { samples: bad.slice(0, 8) });
  },
});

export const invalidLinksRule = defineRule({
  id: "links-invalid",
  category: "links",
  severity: "high",
  weight: 10,
  title: "No empty / javascript: / malformed hrefs",
  description: "Anchors should have usable http(s) or relative hrefs",
  recommendation: "Replace javascript: and empty hrefs with real URLs.",
  check: async ({ $ }) => {
    const bad: Array<{ href: string; reason: string }> = [];
    $("a").each((_, el) => {
      const href = ($(el).attr("href") ?? "").trim();
      if (!href) bad.push({ href, reason: "empty" });
      else if (/^javascript:/i.test(href)) bad.push({ href, reason: "javascript" });
      else if (/\s/.test(href)) bad.push({ href, reason: "whitespace" });
    });
    if (bad.length === 0) return pass("No invalid hrefs detected");
    return fail(`${bad.length} invalid href(s)`, { samples: bad.slice(0, 8) });
  },
});

export const httpsDowngradeRule = defineRule({
  id: "links-https-downgrade",
  category: "links",
  severity: "high",
  weight: 10,
  title: "No HTTPS → HTTP downgrades",
  description: "HTTPS pages should not link to http:// same-site or insecure assets as primary nav",
  recommendation: "Upgrade internal and asset links to https://.",
  check: async ({ page }) => {
    if (!page.finalUrl.startsWith("https:")) return pass("Page is not HTTPS");
    const downgrades = page.links.filter((l) => l.href.startsWith("http://"));
    if (downgrades.length === 0) return pass("No http:// links from an HTTPS page");
    return warn(`${downgrades.length} http:// link(s) from HTTPS page`, {
      samples: downgrades.slice(0, 8).map((l) => l.href),
    });
  },
});

export const externalCountRule = defineRule({
  id: "links-external-count",
  category: "links",
  severity: "low",
  weight: 3,
  title: "External link volume",
  description: "Warn when a page has a very large number of external links",
  recommendation: "Review whether all external links are intentional and valuable.",
  check: async ({ page }) => {
    const n = page.links.filter((l) => !l.isInternal).length;
    if (n > 100) return warn(`${n} external links on one page`, { count: n });
    return pass(`${n} external link(s)`, { count: n });
  },
});

export const nofollowInternalRule = defineRule({
  id: "links-nofollow-internal",
  category: "links",
  severity: "medium",
  weight: 6,
  title: "Internal links should pass equity",
  description: "Same-host links generally should not carry rel=nofollow",
  recommendation: "Remove nofollow from internal links unless intentionally quarantining a section.",
  check: async ({ page }) => {
    const bad = page.links.filter((l) => l.isInternal && l.isNoFollow);
    if (bad.length === 0) return pass("No nofollow on internal links");
    return warn(`${bad.length} internal nofollow link(s)`, {
      samples: bad.slice(0, 8).map((l) => l.href),
    });
  },
});

export const localhostLinksRule = defineRule({
  id: "links-localhost",
  category: "links",
  severity: "critical",
  weight: 12,
  title: "No localhost links in production",
  description: "Production pages should not link to localhost / 127.0.0.1",
  recommendation: "Remove localhost URLs before shipping.",
  check: async ({ page }) => {
    const bad = page.links.filter((l) =>
      /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?/i.test(l.href),
    );
    if (bad.length === 0) return pass("No localhost links");
    return fail(`${bad.length} localhost link(s)`, {
      samples: bad.slice(0, 5).map((l) => l.href),
    });
  },
});

export const localFileLinksRule = defineRule({
  id: "links-local-file",
  category: "links",
  severity: "critical",
  weight: 10,
  title: "No file:// links",
  description: "Pages must not use file:// protocol links",
  recommendation: "Replace file:// links with web URLs.",
  check: async ({ page }) => {
    const bad = page.links.filter((l) => l.href.startsWith("file:"));
    if (bad.length === 0) return pass("No file:// links");
    return fail(`${bad.length} file:// link(s)`);
  },
});

export const nonHttpProtocolRule = defineRule({
  id: "links-non-http-protocol",
  category: "links",
  severity: "low",
  weight: 3,
  title: "Unusual link protocols",
  description: "Flags ftp:/intent: and similar non-web protocols in anchors",
  recommendation: "Prefer http(s), mailto, and tel for user-facing links.",
  check: async ({ page }) => {
    const bad = page.links.filter((l) =>
      /^(ftp|intent|data|blob):/i.test(l.href),
    );
    if (bad.length === 0) return pass("No unusual protocols");
    return warn(`${bad.length} unusual protocol link(s)`, {
      samples: bad.slice(0, 5).map((l) => l.href),
    });
  },
});

export const telMailtoRule = defineRule({
  id: "links-tel-mailto",
  category: "links",
  severity: "low",
  weight: 3,
  title: "Valid tel: / mailto: formats",
  description: "Special protocol links should look well-formed",
  recommendation: "Use mailto:user@domain and tel:+E164 formats.",
  check: async ({ $ }) => {
    const bad: string[] = [];
    $("a[href^='mailto:'],a[href^='tel:']").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      if (href.startsWith("mailto:")) {
        const addr = href.slice(7).split("?")[0] ?? "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) bad.push(href);
      } else if (href.startsWith("tel:")) {
        const num = href.slice(4).replace(/[\s()-]/g, "");
        if (!/^\+?[\d]{7,15}$/.test(num)) bad.push(href);
      }
    });
    if (bad.length === 0) return pass("tel:/mailto: links look valid");
    return warn(`${bad.length} malformed tel:/mailto: link(s)`, { samples: bad.slice(0, 5) });
  },
});

export const onclickNavRule = defineRule({
  id: "links-onclick",
  category: "links",
  severity: "medium",
  weight: 5,
  title: "Prefer <a href> over onclick navigation",
  description: "onclick-only navigation is harder for crawlers",
  recommendation: "Use real <a href> links; reserve onclick for enhancement.",
  check: async ({ $ }) => {
    let count = 0;
    $("[onclick]").each((_, el) => {
      const tag = String($(el).prop("tagName") ?? "").toLowerCase();
      const href = $(el).attr("href");
      if (tag !== "a" || !href) count++;
    });
    if (count === 0) return pass("No onclick-only navigation spotted");
    return warn(`${count} element(s) navigate via onclick without href`);
  },
});

export const deadEndPagesRule = defineRule({
  id: "links-dead-end-pages",
  category: "links",
  severity: "medium",
  weight: 6,
  title: "Pages should have outgoing internal links",
  description: "Dead-end pages stop crawl discovery",
  recommendation: "Add related links or breadcrumbs on leaf pages.",
  check: async ({ page }) => {
    const out = page.links.filter((l) => l.isInternal).length;
    if (out === 0) return warn("Dead-end page — no outgoing internal links");
    return pass("Page has outgoing internal links");
  },
});

export const excessiveLinksRule = defineRule({
  id: "links-excessive",
  category: "links",
  severity: "low",
  weight: 3,
  title: "Reasonable internal link count",
  description: "Very large internal link counts can dilute crawl focus",
  recommendation: "Keep navigation focused; paginate or nest deep link lists.",
  check: async ({ page }) => {
    const n = page.links.filter((l) => l.isInternal).length;
    if (n > 250) return warn(`${n} internal links on one page`, { count: n });
    return pass(`${n} internal links`, { count: n });
  },
});

export const brokenFragmentRule = defineRule({
  id: "links-broken-fragment",
  category: "links",
  severity: "low",
  weight: 4,
  title: "In-page fragments resolve",
  description: "Hash links should match an element id on the page",
  recommendation: "Fix or remove broken #fragment links.",
  check: async ({ page, $ }) => {
    const ids = new Set<string>();
    $("[id]").each((_, el) => {
      const id = $(el).attr("id");
      if (id) ids.add(id);
    });
    const broken: string[] = [];
    for (const link of page.links) {
      try {
        const u = new URL(link.href);
        if (u.origin + u.pathname !== new URL(page.finalUrl).origin + new URL(page.finalUrl).pathname) {
          continue;
        }
        if (u.hash && u.hash.length > 1) {
          const id = decodeURIComponent(u.hash.slice(1));
          if (!ids.has(id)) broken.push(u.hash);
        }
      } catch {
        /* ignore */
      }
    }
    if (broken.length === 0) return pass("In-page fragments resolve");
    return warn(`${broken.length} broken fragment(s)`, { samples: broken.slice(0, 8) });
  },
});

/**
 * HEAD-check a capped set of unique internal targets.
 * Kept bounded so quick audits stay fast.
 */
export const brokenInternalRule = defineRule({
  id: "links-broken-internal",
  category: "links",
  severity: "critical",
  weight: 15,
  title: "No broken internal links",
  description: "Internal links should not return 404/410/5xx",
  recommendation: "Fix or remove broken internal URLs.",
  check: async ({ page, config }) => {
    const targets = Array.from(
      new Set(
        page.links
          .filter((l) => l.isInternal)
          .map((l) => {
            try {
              const u = new URL(l.href);
              u.hash = "";
              return u.href;
            } catch {
              return null;
            }
          })
          .filter((x): x is string => Boolean(x)),
      ),
    ).slice(0, config.mode === "quick" ? 15 : 40);

    if (targets.length === 0) return pass("No internal targets to check");

    const broken: Array<{ href: string; status: number }> = [];
    const unchecked: string[] = [];

    for (const href of targets) {
      try {
        const res = await fetch(href, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(Math.min(config.timeoutMs, 8000)),
          headers: { "user-agent": "SeoToolAuditBot/1.0" },
        });
        // Some servers reject HEAD — fall back to GET range-less.
        let status = res.status;
        if (status === 405 || status === 501) {
          const getRes = await fetch(href, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(Math.min(config.timeoutMs, 8000)),
            headers: { "user-agent": "SeoToolAuditBot/1.0" },
          });
          status = getRes.status;
          // Drain body lightly
          await getRes.arrayBuffer().catch(() => undefined);
        }
        if (status === 404 || status === 410 || status >= 500) {
          broken.push({ href, status });
        }
      } catch {
        unchecked.push(href);
      }
    }

    if (broken.length > 0) {
      return fail(`${broken.length} broken internal link(s)`, {
        samples: broken.slice(0, 8),
        unchecked: unchecked.slice(0, 5),
      });
    }
    if (unchecked.length > 0) {
      return warn(`Could not verify ${unchecked.length} internal link(s)`, {
        samples: unchecked.slice(0, 5),
      });
    }
    return pass(`Checked ${targets.length} internal target(s)`);
  },
});

export const inboundNofollowRule = defineRule({
  id: "links-inbound-all-nofollow",
  category: "links",
  severity: "high",
  weight: 8,
  title: "Inbound equity not fully nofollow",
  description: "A page whose only inbound links are nofollow gets no internal equity",
  recommendation: "Ensure at least one followed internal inbound link.",
  requiresCrawl: true,
  check: async ({ page, crawl }) => {
    if (!crawl || crawl.pages.length < 2) return unmeasured("Needs multi-page crawl");
    const key = normalizeUrl(page.finalUrl);
    const inboundUrls = crawl.inbound.get(key) ?? [];
    if (inboundUrls.length === 0) return pass("No inbound links in crawl (orphan covered elsewhere)");

    let followed = 0;
    let nofollow = 0;
    for (const from of inboundUrls) {
      const src = crawl.pages.find((p) => normalizeUrl(p.finalUrl) === normalizeUrl(from));
      if (!src) continue;
      for (const link of src.links) {
        if (normalizeUrl(link.href) !== key) continue;
        if (link.isNoFollow) nofollow++;
        else followed++;
      }
    }
    if (followed === 0 && nofollow > 0) {
      return fail("All inbound internal links are nofollow", { nofollow });
    }
    return pass("At least one followed inbound link", { followed, nofollow });
  },
});

export const redirectChainLinksRule = defineRule({
  id: "links-redirect-chains",
  category: "links",
  severity: "medium",
  weight: 6,
  title: "Internal links avoid long redirect chains",
  description: "Spot-checks a few internal links for multi-hop redirects",
  recommendation: "Update hrefs to the final URL to skip redirect hops.",
  check: async ({ page, config }) => {
    const targets = Array.from(
      new Set(page.links.filter((l) => l.isInternal).map((l) => l.href)),
    ).slice(0, config.mode === "quick" ? 8 : 20);

    const chained: Array<{ href: string; hops: number }> = [];
    for (const href of targets) {
      try {
        let current = href;
        let hops = 0;
        for (let i = 0; i < 6; i++) {
          const res = await fetch(current, {
            redirect: "manual",
            signal: AbortSignal.timeout(Math.min(config.timeoutMs, 6000)),
            headers: { "user-agent": "SeoToolAuditBot/1.0" },
          });
          if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (!loc) break;
            hops++;
            current = new URL(loc, current).href;
            continue;
          }
          break;
        }
        if (hops >= 2) chained.push({ href, hops });
      } catch {
        /* ignore */
      }
    }
    if (chained.length === 0) return pass("No multi-hop redirect chains on sampled links");
    return warn(`${chained.length} link(s) with ≥2 redirect hops`, {
      samples: chained.slice(0, 6),
    });
  },
});

const LINK_RULES = [
  internalLinksPresentRule,
  anchorTextRule,
  invalidLinksRule,
  httpsDowngradeRule,
  externalCountRule,
  nofollowInternalRule,
  localhostLinksRule,
  localFileLinksRule,
  nonHttpProtocolRule,
  telMailtoRule,
  onclickNavRule,
  deadEndPagesRule,
  excessiveLinksRule,
  brokenFragmentRule,
  brokenInternalRule,
  inboundNofollowRule,
  redirectChainLinksRule,
];

export function registerLinkRules(): void {
  for (const rule of LINK_RULES) registerRule(rule);
}

export { LINK_RULES };
