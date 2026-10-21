import type { CategoryDefinition } from "@/audit/types";

/**
 * SEOmator category weights (sum 100). Wave 1 only activates core /
 * technical / crawlability; the scorer renormalizes over active cats.
 */
export const AUDIT_CATEGORIES: CategoryDefinition[] = [
  { id: "core", name: "Core", description: "Titles, meta, H1, canonicals, robots", weight: 11 },
  { id: "technical", name: "Technical SEO", description: "HTTP, soft-404, robots/sitemap presence", weight: 7 },
  { id: "crawlability", name: "Crawlability", description: "Sitemap cross-checks, orphans, depth", weight: 5 },
  { id: "perf", name: "Performance", description: "CWV and asset performance", weight: 10 },
  { id: "links", name: "Links", description: "Internal/external link quality", weight: 8 },
  { id: "images", name: "Images", description: "Alt, dimensions, formats", weight: 8 },
  { id: "security", name: "Security", description: "HTTPS and security headers", weight: 8 },
  { id: "schema", name: "Structured Data", description: "JSON-LD / schema.org", weight: 5 },
  { id: "a11y", name: "Accessibility", description: "a11y signals", weight: 7 },
  { id: "content", name: "Content", description: "Thin/duplicate content", weight: 5 },
  { id: "social", name: "Social", description: "Open Graph / Twitter cards", weight: 3 },
  { id: "eeat", name: "E-E-A-T", description: "Experience, expertise, trust", weight: 3 },
  { id: "url", name: "URL Structure", description: "URL hygiene", weight: 3 },
  { id: "mobile", name: "Mobile", description: "Mobile usability", weight: 2 },
  { id: "i18n", name: "Internationalization", description: "hreflang", weight: 2 },
  { id: "legal", name: "Legal Compliance", description: "Cookie consent etc.", weight: 1 },
  { id: "js", name: "JavaScript Rendering", description: "Raw vs rendered DOM", weight: 5 },
  { id: "redirect", name: "Redirects", description: "Redirect chains and loops", weight: 3 },
  { id: "html", name: "HTML Validation", description: "Doctype, charset, structure", weight: 2 },
  { id: "geo", name: "AI/GEO Readiness", description: "llms.txt, AI crawlers", weight: 2 },
];

export const WAVE1_CATEGORIES = ["core", "technical", "crawlability"] as const;
