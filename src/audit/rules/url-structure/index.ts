import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";
import { registerRule } from "@/audit/engine/rule-registry";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gclsrc",
  "dclid",
  "wbraid",
  "gbraid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
  "ref",
]);

const SESSION_PARAMS = new Set([
  "sessionid",
  "session_id",
  "phpsessid",
  "jsessionid",
  "sid",
  "asp.net_sessionid",
]);

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export const urlLengthRule = defineRule({
  id: "url-length",
  category: "url",
  severity: "low",
  weight: 3,
  title: "URL length",
  description: "Very long URLs are harder to share and sometimes truncated",
  recommendation: "Keep URLs under ~115 characters when practical.",
  check: async ({ page }) => {
    const len = page.finalUrl.length;
    if (len > 200) return fail(`URL is very long (${len} chars)`, { length: len });
    if (len > 115) return warn(`URL is long (${len} chars)`, { length: len });
    return pass(`URL length ${len}`, { length: len });
  },
});

export const urlUppercaseRule = defineRule({
  id: "url-uppercase",
  category: "url",
  severity: "medium",
  weight: 5,
  title: "Prefer lowercase paths",
  description: "Mixed-case paths create duplicate URL variants",
  recommendation: "Normalize paths to lowercase and redirect variants.",
  check: async ({ page }) => {
    const path = pathOf(page.finalUrl);
    if (path !== path.toLowerCase()) {
      return warn("Path contains uppercase characters", { path });
    }
    return pass("Path is lowercase");
  },
});

export const urlUnderscoresRule = defineRule({
  id: "url-underscores",
  category: "url",
  severity: "low",
  weight: 3,
  title: "Prefer hyphens over underscores",
  description: "Google treats hyphens as word separators; underscores less so",
  recommendation: "Use hyphens in slugs instead of underscores.",
  check: async ({ page }) => {
    const path = pathOf(page.finalUrl);
    if (path.includes("_")) return warn("Path contains underscores", { path });
    return pass("No underscores in path");
  },
});

export const urlSpacesRule = defineRule({
  id: "url-spaces",
  category: "url",
  severity: "high",
  weight: 8,
  title: "No spaces in URL",
  description: "Spaces become %20 and look broken in SERPs",
  recommendation: "Remove spaces from paths; use hyphens.",
  check: async ({ page }) => {
    if (/%20|\s/.test(page.finalUrl)) {
      return fail("URL contains spaces / %20");
    }
    return pass("URL has no spaces");
  },
});

export const urlDoubleSlashRule = defineRule({
  id: "url-double-slash",
  category: "url",
  severity: "medium",
  weight: 5,
  title: "No accidental double slashes",
  description: "Paths like //blog create alternate URLs",
  recommendation: "Normalize paths to single slashes.",
  check: async ({ page }) => {
    const path = pathOf(page.finalUrl);
    if (path.includes("//")) return warn("Path contains //", { path });
    return pass("No double slashes in path");
  },
});

export const urlTrackingParamsRule = defineRule({
  id: "url-tracking-params",
  category: "url",
  severity: "medium",
  weight: 7,
  title: "No tracking params in indexed URL",
  description: "utm_*/gclid/fbclid on the canonical URL create duplicates",
  recommendation: "Strip tracking params via redirects or canonical.",
  check: async ({ page }) => {
    try {
      const u = new URL(page.finalUrl);
      const hits = [...u.searchParams.keys()].filter((k) =>
        TRACKING_PARAMS.has(k.toLowerCase()),
      );
      if (hits.length === 0) return pass("No tracking params in URL");
      return warn(`Tracking params in URL: ${hits.join(", ")}`, { hits });
    } catch {
      return pass("Could not parse URL");
    }
  },
});

export const urlSessionIdsRule = defineRule({
  id: "url-session-ids",
  category: "url",
  severity: "high",
  weight: 10,
  title: "No session IDs in URL",
  description: "Session IDs in query strings create infinite URL variants",
  recommendation: "Store sessions in cookies; strip session params from URLs.",
  check: async ({ page }) => {
    try {
      const u = new URL(page.finalUrl);
      const hits = [...u.searchParams.keys()].filter((k) =>
        SESSION_PARAMS.has(k.toLowerCase()),
      );
      if (hits.length === 0 && !/;jsessionid=/i.test(page.finalUrl)) {
        return pass("No session IDs in URL");
      }
      return fail("Session identifier found in URL", { hits });
    } catch {
      return pass("Could not parse URL");
    }
  },
});

export const urlNonAsciiRule = defineRule({
  id: "url-non-ascii",
  category: "url",
  severity: "low",
  weight: 3,
  title: "ASCII-friendly URLs",
  description: "Non-ASCII paths are valid but often poorly shared",
  recommendation: "Prefer ASCII slugs; ensure encoding is consistent.",
  check: async ({ page }) => {
    const path = pathOf(page.finalUrl);
    if (/[^\x00-\x7F]/.test(path) || /%[0-9A-F]{2}/i.test(path)) {
      // percent-encoding alone is fine; flag raw non-ascii
      if (/[^\x00-\x7F]/.test(decodeURIComponent(path))) {
        return warn("Path contains non-ASCII characters", { path });
      }
    }
    return pass("Path is ASCII-friendly");
  },
});

export const urlParametersRule = defineRule({
  id: "url-parameters",
  category: "url",
  severity: "low",
  weight: 3,
  title: "Moderate query-string complexity",
  description: "Many query params often signal faceted / duplicate URLs",
  recommendation: "Canonicalize faceted URLs; limit indexable parameter combos.",
  check: async ({ page }) => {
    try {
      const u = new URL(page.finalUrl);
      const n = [...u.searchParams.keys()].length;
      if (n >= 6) return warn(`URL has ${n} query parameters`, { count: n });
      return pass(`${n} query parameter(s)`, { count: n });
    } catch {
      return pass("Could not parse URL");
    }
  },
});

export const urlRepetitivePathRule = defineRule({
  id: "url-repetitive-path",
  category: "url",
  severity: "medium",
  weight: 5,
  title: "No repetitive path segments",
  description: "Detects /blog/blog/ style duplication",
  recommendation: "Clean nested duplicate path segments.",
  check: async ({ page }) => {
    const parts = pathOf(page.finalUrl).split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
      if (parts[i] === parts[i - 1]) {
        return warn("Repetitive path segments", { parts });
      }
    }
    return pass("No repetitive path segments");
  },
});

export const urlInternalSearchRule = defineRule({
  id: "url-internal-search",
  category: "url",
  severity: "medium",
  weight: 5,
  title: "Internal search URLs",
  description: "Site-search result URLs are usually thin / duplicate",
  recommendation: "noindex internal search result pages.",
  check: async ({ page }) => {
    const path = pathOf(page.finalUrl).toLowerCase();
    const isSearch =
      /\/(search|recherche|find)\b/.test(path) ||
      /[?&](q|query|s|search)=/i.test(page.finalUrl);
    if (!isSearch) return pass("Not an internal search URL");
    return warn("URL looks like an internal search results page", { url: page.finalUrl });
  },
});

export const urlHttpHttpsDuplicateRule = defineRule({
  id: "url-http-https-duplicate",
  category: "url",
  severity: "high",
  weight: 8,
  title: "Final URL is HTTPS",
  description: "Prefer a single HTTPS host as the indexed variant",
  recommendation: "301 HTTP → HTTPS (and www policy) consistently.",
  check: async ({ page }) => {
    if (page.finalUrl.startsWith("https:")) return pass("Final URL is HTTPS");
    return fail("Final URL is not HTTPS", { url: page.finalUrl });
  },
});

const URL_RULES = [
  urlLengthRule,
  urlUppercaseRule,
  urlUnderscoresRule,
  urlSpacesRule,
  urlDoubleSlashRule,
  urlTrackingParamsRule,
  urlSessionIdsRule,
  urlNonAsciiRule,
  urlParametersRule,
  urlRepetitivePathRule,
  urlInternalSearchRule,
  urlHttpHttpsDuplicateRule,
];

export function registerUrlStructureRules(): void {
  for (const rule of URL_RULES) registerRule(rule);
}

export { URL_RULES };
