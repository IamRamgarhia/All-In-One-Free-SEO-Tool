import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

function header(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export const securityHttpsRule = defineRule({
  id: "security-https",
  category: "security",
  severity: "critical",
  weight: 18,
  title: "HTTPS",
  description: "Site should be served over HTTPS",
  recommendation: "Install SSL and redirect all HTTP traffic to HTTPS.",
  check: async ({ page }) => {
    if (page.finalUrl.startsWith("https:")) return pass("Served over HTTPS");
    return fail("Page is not HTTPS", { url: page.finalUrl });
  },
});

export const hstsRule = defineRule({
  id: "security-hsts",
  category: "security",
  severity: "high",
  weight: 10,
  title: "HSTS header",
  description: "Strict-Transport-Security locks browsers onto HTTPS",
  recommendation: "Add Strict-Transport-Security with max-age ≥ 1 year.",
  check: async ({ page, response }) => {
    if (!page.finalUrl.startsWith("https:")) return pass("Not HTTPS");
    const v = header(response.headers, "strict-transport-security");
    if (!v) return warn("Missing Strict-Transport-Security header");
    const maxAge = /max-age=(\d+)/i.exec(v);
    const age = maxAge ? Number(maxAge[1]) : 0;
    if (age < 31_536_000) {
      return warn(`HSTS max-age too short (${age}s)`, { value: v });
    }
    return pass("HSTS present with adequate max-age", { value: v });
  },
});

export const cspRule = defineRule({
  id: "security-csp",
  category: "security",
  severity: "medium",
  weight: 8,
  title: "Content-Security-Policy",
  description: "CSP reduces XSS impact",
  recommendation: "Implement Content-Security-Policy header.",
  check: async ({ response }) => {
    const v =
      header(response.headers, "content-security-policy") ??
      header(response.headers, "content-security-policy-report-only");
    if (!v) return warn("Missing Content-Security-Policy header");
    return pass("CSP header present");
  },
});

export const xFrameOptionsRule = defineRule({
  id: "security-x-frame-options",
  category: "security",
  severity: "medium",
  weight: 7,
  title: "X-Frame-Options / frame-ancestors",
  description: "Clickjacking protection via XFO or CSP frame-ancestors",
  recommendation: "Add X-Frame-Options: DENY or SAMEORIGIN (or CSP frame-ancestors).",
  check: async ({ response }) => {
    const xfo = header(response.headers, "x-frame-options");
    const csp = header(response.headers, "content-security-policy") ?? "";
    if (xfo || /frame-ancestors/i.test(csp)) {
      return pass("Frame protection present", { xfo, hasCspAncestors: /frame-ancestors/i.test(csp) });
    }
    return warn("Missing X-Frame-Options and CSP frame-ancestors");
  },
});

export const xContentTypeOptionsRule = defineRule({
  id: "security-x-content-type-options",
  category: "security",
  severity: "medium",
  weight: 6,
  title: "X-Content-Type-Options",
  description: "nosniff prevents MIME sniffing attacks",
  recommendation: 'Add X-Content-Type-Options: nosniff.',
  check: async ({ response }) => {
    const v = header(response.headers, "x-content-type-options");
    if (!v) return warn("Missing X-Content-Type-Options");
    if (!/nosniff/i.test(v)) return warn(`Unexpected X-Content-Type-Options: ${v}`);
    return pass("X-Content-Type-Options: nosniff");
  },
});

export const referrerPolicyRule = defineRule({
  id: "security-referrer-policy",
  category: "security",
  severity: "low",
  weight: 4,
  title: "Referrer-Policy",
  description: "Controls referrer leakage on navigations",
  recommendation: "Add Referrer-Policy: strict-origin-when-cross-origin.",
  check: async ({ response }) => {
    const v = header(response.headers, "referrer-policy");
    if (!v) return warn("Missing Referrer-Policy header");
    return pass(`Referrer-Policy: ${v}`);
  },
});

export const permissionsPolicyRule = defineRule({
  id: "security-permissions-policy",
  category: "security",
  severity: "low",
  weight: 3,
  title: "Permissions-Policy",
  description: "Restricts powerful browser features",
  recommendation: "Add Permissions-Policy header to control browser features.",
  check: async ({ response }) => {
    const v =
      header(response.headers, "permissions-policy") ??
      header(response.headers, "feature-policy");
    if (!v) return warn("Missing Permissions-Policy header");
    return pass("Permissions-Policy present");
  },
});

export const externalLinksRelRule = defineRule({
  id: "security-external-links",
  category: "security",
  severity: "medium",
  weight: 7,
  title: "External target=_blank uses noopener",
  description: "target=_blank without rel noopener enables tabnabbing",
  recommendation: 'Add rel="noopener noreferrer" to external target="_blank" links.',
  check: async ({ $, page }) => {
    let origin = "";
    try {
      origin = new URL(page.finalUrl).origin;
    } catch {
      return pass("Could not parse origin");
    }
    const bad: string[] = [];
    $("a[href][target='_blank'],a[href][target=\"_blank\"]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const rel = ($(el).attr("rel") ?? "").toLowerCase();
      let isExternal = false;
      try {
        const u = new URL(href, page.finalUrl);
        isExternal = u.origin !== origin && /^https?:$/.test(u.protocol);
      } catch {
        return;
      }
      if (!isExternal) return;
      if (!/\bnoopener\b/.test(rel) && !/\bnoreferrer\b/.test(rel)) {
        bad.push(href);
      }
    });
    if (bad.length === 0) return pass("External blank links use noopener/noreferrer");
    return warn(`${bad.length} external blank link(s) missing noopener`, {
      samples: bad.slice(0, 5),
    });
  },
});

export const formHttpsRule = defineRule({
  id: "security-form-https",
  category: "security",
  severity: "high",
  weight: 8,
  title: "Form actions are HTTPS",
  description: "Forms should not post to http:// endpoints",
  recommendation: "Update form actions to use HTTPS URLs.",
  check: async ({ $ }) => {
    const bad: string[] = [];
    $("form[action]").each((_, el) => {
      const action = $(el).attr("action") ?? "";
      if (action.startsWith("http://")) bad.push(action);
    });
    if (bad.length === 0) return pass("No http:// form actions");
    return fail(`${bad.length} form(s) post to HTTP`, { samples: bad.slice(0, 5) });
  },
});

export const mixedContentSecurityRule = defineRule({
  id: "security-mixed-content",
  category: "security",
  severity: "high",
  weight: 8,
  title: "No mixed content",
  description: "HTTPS pages must not load http:// assets",
  recommendation: "Replace HTTP resource URLs with HTTPS.",
  check: async ({ page, $ }) => {
    if (!page.finalUrl.startsWith("https:")) return pass("Not HTTPS");
    const offenders: string[] = [];
    $("script[src],link[href],img[src],iframe[src],source[src]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      if (src.startsWith("http://")) offenders.push(src);
    });
    if (offenders.length === 0) return pass("No mixed content");
    return fail(`${offenders.length} http:// asset(s)`, {
      samples: offenders.slice(0, 5),
    });
  },
});

export const infoDisclosureRule = defineRule({
  id: "security-info-disclosure",
  category: "security",
  severity: "low",
  weight: 4,
  title: "No version leakage headers",
  description: "Server / X-Powered-By can reveal stack versions",
  recommendation: "Suppress Server, X-Powered-By, X-Generator version banners.",
  check: async ({ response }) => {
    const noisy: string[] = [];
    for (const name of ["server", "x-powered-by", "x-generator", "x-aspnet-version"]) {
      const v = header(response.headers, name);
      if (v && /\d+\.\d+/.test(v)) noisy.push(`${name}: ${v}`);
    }
    if (noisy.length === 0) return pass("No obvious version-leaking headers");
    return warn(`Version leakage: ${noisy.join("; ")}`, { noisy });
  },
});

export const sriRule = defineRule({
  id: "security-sri",
  category: "security",
  severity: "low",
  weight: 4,
  title: "Subresource Integrity on CDNs",
  description: "Cross-origin scripts/styles should use integrity hashes",
  recommendation: 'Add integrity + crossorigin="anonymous" on CDN assets.',
  check: async ({ $, page }) => {
    let origin = "";
    try {
      origin = new URL(page.finalUrl).origin;
    } catch {
      return pass("Bad URL");
    }
    const missing: string[] = [];
    $('script[src],link[rel="stylesheet"][href]').each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      try {
        const u = new URL(src, page.finalUrl);
        if (u.origin === origin) return;
        if (!/^https?:$/.test(u.protocol)) return;
        if (!$(el).attr("integrity")) missing.push(src);
      } catch {
        /* ignore */
      }
    });
    if (missing.length === 0) return pass("Cross-origin assets have SRI or none found");
    if (missing.length <= 2) {
      return warn(`${missing.length} cross-origin asset(s) without SRI`, {
        samples: missing.slice(0, 4),
      });
    }
    return warn(`${missing.length} cross-origin assets without SRI`, {
      samples: missing.slice(0, 4),
    });
  },
});

const SECURITY_RULES = [
  securityHttpsRule,
  hstsRule,
  cspRule,
  xFrameOptionsRule,
  xContentTypeOptionsRule,
  referrerPolicyRule,
  permissionsPolicyRule,
  externalLinksRelRule,
  formHttpsRule,
  mixedContentSecurityRule,
  infoDisclosureRule,
  sriRule,
];

export function registerSecurityRules(): void {
  for (const rule of SECURITY_RULES) registerRule(rule);
}

export { SECURITY_RULES };
