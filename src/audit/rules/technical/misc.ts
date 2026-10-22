import { defineRule, fail, pass, warn } from "@/audit/engine/define-rule";

export const emptyHtmlRule = defineRule({
  id: "technical-empty-html",
  category: "technical",
  severity: "critical",
  weight: 15,
  title: "HTML body not empty",
  description: "Page should return meaningful HTML",
  recommendation: "Ensure the server returns a full HTML document for this URL.",
  check: async ({ page }) => {
    if (!page.rawHtml || page.rawHtml.trim().length < 50) {
      return fail("HTML response is empty or tiny", { bytes: page.rawHtml.length });
    }
    if (page.wordCount === 0) {
      return warn("HTML present but no visible body text", { bytes: page.rawHtml.length });
    }
    return pass("HTML document has content", { wordCount: page.wordCount });
  },
});

export const contentTypeRule = defineRule({
  id: "technical-content-type",
  category: "technical",
  severity: "medium",
  weight: 5,
  title: "HTML content-type",
  description: "Response should be text/html for page audits",
  recommendation: "Serve pages with Content-Type: text/html; charset=utf-8.",
  check: async ({ response }) => {
    const ct = (response.headers["content-type"] ?? "").toLowerCase();
    if (!ct) return warn("Missing Content-Type header");
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return fail(`Unexpected Content-Type: ${ct}`, { contentType: ct });
    }
    return pass("Content-Type is HTML", { contentType: ct });
  },
});

export const redirectChainRule = defineRule({
  id: "technical-redirect-chain",
  category: "technical",
  severity: "medium",
  weight: 8,
  title: "Short redirect chain",
  description: "Landing URL should not hop through long redirect chains",
  recommendation: "Collapse redirect chains to a single hop where possible.",
  check: async ({ response }) => {
    const n = response.redirectChain.length;
    if (n >= 3) return warn(`Redirect chain has ${n} hops`, { chain: response.redirectChain });
    if (n > 0) return pass(`Redirected once (${n} hop)`, { chain: response.redirectChain });
    return pass("No redirects");
  },
});

export const wwwConsistencyRule = defineRule({
  id: "technical-www-consistency",
  category: "technical",
  severity: "low",
  weight: 4,
  title: "www host consistency",
  description: "Requested host should match final host (www vs apex)",
  recommendation: "Pick www or apex and 301 the other consistently.",
  check: async ({ response }) => {
    try {
      const a = new URL(response.url).hostname.replace(/^www\./, "");
      const b = new URL(response.finalUrl).hostname.replace(/^www\./, "");
      if (a !== b) {
        return warn("Host changed across redirect (possible misconfig)", {
          from: response.url,
          to: response.finalUrl,
        });
      }
      return pass("Host is consistent");
    } catch {
      return fail("Could not parse URLs");
    }
  },
});

export const trailingSlashRule = defineRule({
  id: "technical-trailing-slash",
  category: "technical",
  severity: "info",
  weight: 2,
  title: "Trailing slash stability",
  description: "Final URL slash style should be stable after redirects",
  recommendation: "Pick a trailing-slash policy and enforce it with redirects.",
  check: async ({ response }) => {
    try {
      const req = new URL(response.url);
      const fin = new URL(response.finalUrl);
      const reqSlash = req.pathname.endsWith("/") && req.pathname !== "/";
      const finSlash = fin.pathname.endsWith("/") && fin.pathname !== "/";
      const reqBare = req.pathname.replace(/\/$/, "") || "/";
      const finBare = fin.pathname.replace(/\/$/, "") || "/";
      if (reqBare === finBare && reqSlash !== finSlash) {
        return warn("Trailing-slash redirect between equivalent paths", {
          from: req.pathname,
          to: fin.pathname,
        });
      }
      if (!response.redirected) {
        return pass("No redirect to evaluate", { path: fin.pathname });
      }
      return pass("Trailing slash is consistent with the final URL", {
        finalUrl: response.finalUrl,
      });
    } catch {
      return pass("Could not evaluate trailing slash");
    }
  },
});
