import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

const PERMANENT = new Set([301, 308]);
const TEMPORARY = new Set([302, 303, 307]);

export const redirectTypeRule = defineRule({
  id: "redirect-type",
  category: "redirect",
  severity: "medium",
  weight: 6,
  title: "Prefer 301 for permanent redirects",
  description: "Temporary 302/307 should not be used for permanent moves",
  recommendation: "Use 301 (or 308) for permanent URL changes.",
  check: async ({ response }) => {
    const hops = response.redirectChain.filter(
      (h) => PERMANENT.has(h.statusCode) || TEMPORARY.has(h.statusCode),
    );
    if (hops.length === 0) {
      return pass("Page is not a redirect");
    }
    const statusCodes = hops.map((h) => h.statusCode);
    const temporary = hops.filter((h) => TEMPORARY.has(h.statusCode));
    if (temporary.length === 0) {
      return pass(
        `Permanent redirect (${statusCodes.join(" → ")}) correctly used`,
        { statusCodes, type: "permanent" },
      );
    }
    return warn(
      `Temporary redirect (${temporary.map((h) => h.statusCode).join(", ")}) detected; use 301 or 308 for permanent moves`,
      {
        statusCodes,
        type: "temporary",
        temporaryHops: temporary,
      },
    );
  },
});

export const redirectLoopRule = defineRule({
  id: "redirect-loop",
  category: "redirect",
  severity: "critical",
  weight: 15,
  title: "No redirect loops",
  description: "Detects loops while resolving the page URL",
  recommendation: "Break circular redirects between URLs.",
  check: async ({ response, page }) => {
    const chain = [
      ...response.redirectChain.map((h) => h.url),
      response.finalUrl,
    ];
    const seen = new Set<string>();
    for (const url of chain) {
      const key = url.split("#")[0] ?? url;
      if (seen.has(key)) {
        return fail("Redirect loop detected", { chain });
      }
      seen.add(key);
    }
    if (page.status === 0 && response.redirectChain.length >= 7) {
      return fail("Possible redirect loop (hop limit reached)", { chain });
    }
    return pass("No redirect loop detected");
  },
});

export const metaRefreshRule = defineRule({
  id: "redirect-meta-refresh",
  category: "redirect",
  severity: "high",
  weight: 10,
  title: "Avoid meta refresh redirects",
  description: "Meta refresh is a weak redirect signal vs HTTP 301/302",
  recommendation: "Replace meta refresh with an HTTP redirect.",
  check: async ({ $ }) => {
    const content = $('meta[http-equiv="refresh"]').attr("content") ?? "";
    if (!content) return pass("No meta refresh");
    return warn(`Meta refresh present: ${content}`, { content });
  },
});

export const jsRedirectRule = defineRule({
  id: "redirect-javascript",
  category: "redirect",
  severity: "high",
  weight: 8,
  title: "Avoid JS-only redirects",
  description: "location.href / location.replace redirects are fragile for crawlers",
  recommendation: "Prefer HTTP redirects for permanent moves.",
  check: async ({ page }) => {
    const html = page.rawHtml;
    const hit =
      /location\.(href|replace)\s*=\s*['"]/i.test(html) ||
      /window\.location\s*=\s*['"]/i.test(html);
    if (!hit) return pass("No obvious JS redirect patterns");
    return warn("Possible JavaScript redirect detected in HTML");
  },
});

export const httpRefreshHeaderRule = defineRule({
  id: "redirect-http-refresh",
  category: "redirect",
  severity: "medium",
  weight: 5,
  title: "Avoid Refresh response header",
  description: "Refresh headers are non-standard redirect mechanisms",
  recommendation: "Use Location + 3xx status instead of Refresh headers.",
  check: async ({ response }) => {
    const refresh = response.headers["refresh"];
    if (!refresh) return pass("No Refresh header");
    return warn(`Refresh header present: ${refresh}`, { refresh });
  },
});

export const caseNormalizationRule = defineRule({
  id: "redirect-case-normalization",
  category: "redirect",
  severity: "low",
  weight: 3,
  title: "URL case normalization",
  description: "Final URL path case should match a consistent policy",
  recommendation: "Normalize path casing with redirects to one canonical form.",
  check: async ({ response }) => {
    try {
      const req = new URL(response.url);
      const fin = new URL(response.finalUrl);
      if (req.pathname !== fin.pathname && req.pathname.toLowerCase() === fin.pathname.toLowerCase()) {
        return warn("Redirect only changes path casing", {
          from: req.pathname,
          to: fin.pathname,
        });
      }
      return pass("No case-only redirect");
    } catch {
      return pass("Could not compare URL case");
    }
  },
});

export const brokenRedirectRule = defineRule({
  id: "redirect-broken",
  category: "redirect",
  severity: "critical",
  weight: 12,
  title: "Redirect target is healthy",
  description: "Final URL after redirects should not be an error page",
  recommendation: "Fix redirect targets that land on 4xx/5xx.",
  check: async ({ page, response }) => {
    if (!response.redirected) return pass("No redirect");
    if (page.status >= 400 || page.status === 0) {
      return fail(`Redirect lands on HTTP ${page.status}`, {
        finalUrl: page.finalUrl,
        status: page.status,
      });
    }
    return pass("Redirect lands on a healthy response");
  },
});

export const longRedirectChainRule = defineRule({
  id: "redirect-chain-length",
  category: "redirect",
  severity: "medium",
  weight: 7,
  title: "Short redirect chains",
  description: "Prefer ≤1 hop from request to final URL",
  recommendation: "Update links and redirects to point directly at the final URL.",
  check: async ({ response }) => {
    const hops = response.redirectChain.length;
    if (hops >= 3) return fail(`Redirect chain has ${hops} hops`, { hops });
    if (hops === 2) return warn("Redirect chain has 2 hops", { hops });
    return pass(hops === 0 ? "No redirects" : "Single redirect hop");
  },
});

const REDIRECT_RULES = [
  redirectTypeRule,
  redirectLoopRule,
  metaRefreshRule,
  jsRedirectRule,
  httpRefreshHeaderRule,
  caseNormalizationRule,
  brokenRedirectRule,
  longRedirectChainRule,
];

export function registerRedirectRules(): void {
  for (const rule of REDIRECT_RULES) registerRule(rule);
}

export { REDIRECT_RULES };
