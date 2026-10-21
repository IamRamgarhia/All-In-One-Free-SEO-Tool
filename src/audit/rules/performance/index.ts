import { defineRule, fail, pass, unmeasured, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";
import { verdictFor } from "@/audit/rendering/web-vitals";

export const lcpRule = defineRule({
  id: "cwv-lcp",
  category: "perf",
  severity: "critical",
  weight: 25,
  title: "Largest Contentful Paint (LCP)",
  description: "LCP should be under 2.5s (lab)",
  recommendation: "Optimize LCP: preload hero image, improve TTFB, reduce render-blocking.",
  requiresRendering: true,
  check: async ({ cwv }) => {
    const v = cwv?.lcp;
    const verdict = verdictFor("lcp", v);
    if (verdict === "unmeasured") return unmeasured("LCP not measured");
    const sec = ((v ?? 0) / 1000).toFixed(2);
    if (verdict === "good") return pass(`LCP ${sec}s (good)`, { value: v });
    if (verdict === "needs-improvement") return warn(`LCP ${sec}s (needs improvement)`, { value: v });
    return fail(`LCP ${sec}s (poor)`, { value: v });
  },
});

export const clsRule = defineRule({
  id: "cwv-cls",
  category: "perf",
  severity: "critical",
  weight: 20,
  title: "Cumulative Layout Shift (CLS)",
  description: "CLS should be under 0.1 (lab)",
  recommendation: "Set width/height on images and embeds; avoid injecting content above the fold.",
  requiresRendering: true,
  check: async ({ cwv }) => {
    const v = cwv?.cls;
    const verdict = verdictFor("cls", v);
    if (verdict === "unmeasured") return unmeasured("CLS not measured");
    const n = (v ?? 0).toFixed(3);
    if (verdict === "good") return pass(`CLS ${n} (good)`, { value: v });
    if (verdict === "needs-improvement") return warn(`CLS ${n} (needs improvement)`, { value: v });
    return fail(`CLS ${n} (poor)`, { value: v });
  },
});

export const fcpRule = defineRule({
  id: "cwv-fcp",
  category: "perf",
  severity: "high",
  weight: 12,
  title: "First Contentful Paint (FCP)",
  description: "FCP should be under 1.8s (lab)",
  recommendation: "Inline critical CSS, defer non-critical JS, preload fonts.",
  requiresRendering: true,
  check: async ({ cwv }) => {
    const v = cwv?.fcp;
    const verdict = verdictFor("fcp", v);
    if (verdict === "unmeasured") return unmeasured("FCP not measured");
    const sec = ((v ?? 0) / 1000).toFixed(2);
    if (verdict === "good") return pass(`FCP ${sec}s (good)`, { value: v });
    if (verdict === "needs-improvement") return warn(`FCP ${sec}s (needs improvement)`, { value: v });
    return fail(`FCP ${sec}s (poor)`, { value: v });
  },
});

export const ttfbRule = defineRule({
  id: "cwv-ttfb",
  category: "perf",
  severity: "high",
  weight: 12,
  title: "Time to First Byte (TTFB)",
  description: "TTFB should be under 800ms (lab)",
  recommendation: "Use CDN/caching; optimize origin response time.",
  requiresRendering: true,
  check: async ({ cwv, page }) => {
    const v = cwv?.ttfb ?? page.timingMs;
    const verdict = verdictFor("ttfb", typeof v === "number" ? v : undefined);
    if (verdict === "unmeasured") return unmeasured("TTFB not measured");
    const ms = Math.round(v ?? 0);
    if (verdict === "good") return pass(`TTFB ${ms}ms (good)`, { value: v });
    if (verdict === "needs-improvement") return warn(`TTFB ${ms}ms (needs improvement)`, { value: v });
    return fail(`TTFB ${ms}ms (poor)`, { value: v });
  },
});

export const responseTimeRule = defineRule({
  id: "perf-response-time",
  category: "perf",
  severity: "medium",
  weight: 8,
  title: "HTML response time",
  description: "Initial HTML fetch should be reasonably fast",
  recommendation: "Cache HTML at the edge; reduce origin work for first byte.",
  check: async ({ page }) => {
    const ms = page.timingMs;
    if (ms <= 500) return pass(`Response ${ms}ms`, { value: ms });
    if (ms <= 1000) return warn(`Response ${ms}ms`, { value: ms });
    return fail(`Response ${ms}ms (slow)`, { value: ms });
  },
});

export const domSizeRule = defineRule({
  id: "perf-dom-size",
  category: "perf",
  severity: "medium",
  weight: 8,
  title: "DOM size",
  description: "Very large DOMs hurt interactivity",
  recommendation: "Keep DOM under ~800–1500 nodes; virtualize long lists.",
  check: async ({ $ }) => {
    const count = $("*").length;
    if (count <= 800) return pass(`DOM has ${count} nodes`, { count });
    if (count <= 1500) return warn(`DOM has ${count} nodes`, { count });
    return fail(`DOM has ${count} nodes (too large)`, { count });
  },
});

export const pageWeightRule = defineRule({
  id: "perf-page-weight",
  category: "perf",
  severity: "medium",
  weight: 7,
  title: "HTML document weight",
  description: "HTML payload should stay reasonably small",
  recommendation: "Reduce inlined CSS/JS and huge DOM dumps in HTML.",
  check: async ({ page }) => {
    const bytes = Buffer.byteLength(page.rawHtml, "utf8");
    if (bytes <= 100_000) return pass(`HTML ${(bytes / 1024).toFixed(1)}KB`, { bytes });
    if (bytes <= 300_000) return warn(`HTML ${(bytes / 1024).toFixed(1)}KB`, { bytes });
    return fail(`HTML ${(bytes / 1024).toFixed(1)}KB (heavy)`, { bytes });
  },
});

export const renderBlockingRule = defineRule({
  id: "perf-render-blocking",
  category: "perf",
  severity: "high",
  weight: 10,
  title: "Render-blocking scripts",
  description: "Scripts in <head> without async/defer block rendering",
  recommendation: "Add async/defer, or move non-critical scripts to end of body.",
  check: async ({ $ }) => {
    const blockers: string[] = [];
    $("head script[src]").each((_, el) => {
      const src = $(el).attr("src") ?? "";
      const async = $(el).attr("async") != null;
      const defer = $(el).attr("defer") != null;
      const type = ($(el).attr("type") ?? "").toLowerCase();
      if (type && type !== "text/javascript" && type !== "application/javascript") return;
      if (!async && !defer) blockers.push(src);
    });
    if (blockers.length === 0) return pass("No render-blocking classic scripts in <head>");
    return warn(`${blockers.length} render-blocking script(s)`, {
      samples: blockers.slice(0, 6),
    });
  },
});

export const preconnectRule = defineRule({
  id: "perf-preconnect",
  category: "perf",
  severity: "low",
  weight: 4,
  title: "Preconnect for third parties",
  description: "Third-party origins benefit from rel=preconnect",
  recommendation: "Add <link rel=\"preconnect\"> for critical third-party origins.",
  check: async ({ $, page }) => {
    let host: string;
    try {
      host = new URL(page.finalUrl).host;
    } catch {
      return pass("Could not parse host");
    }
    const thirdParty = new Set<string>();
    $("script[src],link[href],img[src]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      try {
        const u = new URL(src, page.finalUrl);
        if (u.host && u.host !== host) thirdParty.add(u.origin);
      } catch {
        /* ignore */
      }
    });
    if (thirdParty.size === 0) return pass("No third-party origins detected");
    const preconnects = new Set<string>();
    $('link[rel="preconnect"],link[rel="dns-prefetch"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        try {
          preconnects.add(new URL(href, page.finalUrl).origin);
        } catch {
          /* ignore */
        }
      }
    });
    const missing = [...thirdParty].filter((o) => !preconnects.has(o));
    if (missing.length === 0) return pass("Third-party origins have preconnect/dns-prefetch");
    return warn(`${missing.length} third-party origin(s) without preconnect`, {
      samples: missing.slice(0, 5),
    });
  },
});

export const fontDisplayRule = defineRule({
  id: "perf-font-loading",
  category: "perf",
  severity: "medium",
  weight: 5,
  title: "font-display for webfonts",
  description: "Custom fonts should use font-display: swap (or optional)",
  recommendation: "Add font-display: swap to @font-face rules.",
  check: async ({ page }) => {
    const hasFontFace = /@font-face/i.test(page.rawHtml);
    if (!hasFontFace) return pass("No @font-face in HTML");
    if (/font-display\s*:\s*(swap|optional|fallback)/i.test(page.rawHtml)) {
      return pass("font-display present on @font-face");
    }
    return warn("Webfonts without font-display: swap/optional");
  },
});

export const textCompressionRule = defineRule({
  id: "perf-text-compression",
  category: "perf",
  severity: "high",
  weight: 10,
  title: "Text compression",
  description: "HTML responses should be gzip/br compressed",
  recommendation: "Enable gzip or Brotli on the origin/CDN.",
  check: async ({ response }) => {
    const enc = (response.headers["content-encoding"] ?? "").toLowerCase();
    if (enc.includes("br") || enc.includes("gzip") || enc.includes("deflate")) {
      return pass(`Compressed with ${enc}`, { encoding: enc });
    }
    return warn("No Content-Encoding compression on HTML response");
  },
});

export const brotliRule = defineRule({
  id: "perf-brotli",
  category: "perf",
  severity: "low",
  weight: 3,
  title: "Brotli preferred",
  description: "Brotli typically beats gzip for text",
  recommendation: "Prefer Brotli (br) at the CDN/edge.",
  check: async ({ response }) => {
    const enc = (response.headers["content-encoding"] ?? "").toLowerCase();
    if (enc.includes("br")) return pass("Brotli enabled");
    if (enc.includes("gzip")) return warn("gzip in use — consider Brotli");
    return unmeasured("No compression to evaluate");
  },
});

export const cachePolicyRule = defineRule({
  id: "perf-cache-policy",
  category: "perf",
  severity: "medium",
  weight: 6,
  title: "Cache-Control present",
  description: "Responses should declare caching policy",
  recommendation: "Set Cache-Control (and ETag/Last-Modified) appropriately.",
  check: async ({ response }) => {
    const cc = response.headers["cache-control"];
    if (!cc) return warn("Missing Cache-Control header");
    return pass(`Cache-Control: ${cc}`, { cacheControl: cc });
  },
});

export const minifyJsHintRule = defineRule({
  id: "perf-minify-js",
  category: "perf",
  severity: "low",
  weight: 3,
  title: "Inline JS looks minified",
  description: "Large pretty-printed inline scripts suggest missing minification",
  recommendation: "Minify production JavaScript bundles.",
  check: async ({ $ }) => {
    let suspicious = 0;
    $("script:not([src])").each((_, el) => {
      const code = $(el).html() ?? "";
      if (code.length > 4000 && /\n\s{2,}/.test(code)) suspicious++;
    });
    if (suspicious === 0) return pass("No large pretty-printed inline scripts");
    return warn(`${suspicious} large unminified-looking inline script(s)`);
  },
});

export const minifyCssHintRule = defineRule({
  id: "perf-minify-css",
  category: "perf",
  severity: "low",
  weight: 3,
  title: "Inline CSS looks minified",
  description: "Large pretty-printed inline CSS suggests missing minification",
  recommendation: "Minify production CSS.",
  check: async ({ $ }) => {
    let suspicious = 0;
    $("style").each((_, el) => {
      const css = $(el).html() ?? "";
      if (css.length > 4000 && /\n\s{2,}/.test(css)) suspicious++;
    });
    if (suspicious === 0) return pass("No large pretty-printed inline CSS");
    return warn(`${suspicious} large unminified-looking <style> block(s)`);
  },
});

export const http2Rule = defineRule({
  id: "perf-http2",
  category: "perf",
  severity: "low",
  weight: 3,
  title: "Modern transport",
  description: "Prefer HTTP/2+ (best-effort via headers/ALTSVC hints)",
  recommendation: "Serve over HTTP/2 or HTTP/3 at the edge.",
  check: async ({ response }) => {
    // Node fetch often doesn't expose protocol; use alt-svc as a soft signal.
    const alt = response.headers["alt-svc"] ?? "";
    if (/h3|h2/i.test(alt)) return pass("Alt-Svc advertises h2/h3", { alt });
    return unmeasured("HTTP protocol not visible from this fetch stack");
  },
});

export const lcpHintsRule = defineRule({
  id: "perf-lcp-hints",
  category: "perf",
  severity: "medium",
  weight: 6,
  title: "LCP preload hints",
  description: "Hero images benefit from preload / fetchpriority=high",
  recommendation: "Preload the LCP image and set fetchpriority=\"high\".",
  check: async ({ $ }) => {
    const hasPreload = $('link[rel="preload"][as="image"]').length > 0;
    const hasPriority = $("img[fetchpriority='high'],img[fetchpriority=\"high\"]").length > 0;
    if (hasPreload || hasPriority) return pass("LCP image hints present");
    return warn("No image preload / fetchpriority=high detected");
  },
});

export const lazyAboveFoldRule = defineRule({
  id: "perf-lazy-above-fold",
  category: "perf",
  severity: "medium",
  weight: 6,
  title: "Above-fold images not lazy",
  description: "The first images should not use loading=lazy",
  recommendation: "Remove loading=\"lazy\" from LCP/above-fold images.",
  check: async ({ $ }) => {
    const first = $("img").toArray().slice(0, 3);
    const lazyFirst = first.filter((el) => ($(el).attr("loading") ?? "").toLowerCase() === "lazy");
    if (lazyFirst.length === 0) return pass("First images are not lazy-loaded");
    return warn(`${lazyFirst.length} of the first images use loading=lazy`);
  },
});

const PERF_RULES = [
  lcpRule,
  clsRule,
  fcpRule,
  ttfbRule,
  responseTimeRule,
  domSizeRule,
  pageWeightRule,
  renderBlockingRule,
  preconnectRule,
  fontDisplayRule,
  textCompressionRule,
  brotliRule,
  cachePolicyRule,
  minifyJsHintRule,
  minifyCssHintRule,
  http2Rule,
  lcpHintsRule,
  lazyAboveFoldRule,
];

export function registerPerformanceRules(): void {
  for (const rule of PERF_RULES) registerRule(rule);
}

export { PERF_RULES };
