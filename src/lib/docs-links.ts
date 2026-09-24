/**
 * Where the documentation lives, and which page explains which screen.
 *
 * One map, for the same reason the GitHub slug is one constant: a docs
 * URL written inline in a dozen components is a dozen links to fix when
 * the site moves, and in practice half of them never get fixed.
 *
 * The site itself is built from docs-site/ and uploaded as static files,
 * so this is the only thing in the app that knows the address.
 */

/** Override for a self-hosted copy of the docs, or a moved folder. */
export const DOCS_BASE = (
  process.env.NEXT_PUBLIC_DOCS_URL ?? "https://dicecodes.com/seo-tool/"
).replace(/\/*$/, "/");

/**
 * Route prefix → documentation page.
 *
 * Longest prefix wins, so "/agent/autopilot" can differ from "/agent"
 * without the order of this object mattering.
 */
const ROUTE_DOCS: Record<string, string> = {
  "/": "index.html",
  "/welcome": "first-run.html",
  "/clients": "clients.html",
  "/audits": "audits.html",
  "/tasks": "tasks.html",
  "/morning": "tasks.html#ranked",
  "/keywords": "keywords.html",
  "/cannibalization": "keywords.html#quick-wins",
  "/serp-scans": "keywords.html",
  "/cwv": "keywords.html",
  "/content": "content.html",
  "/title-tests": "content.html#experiments",
  "/meta-rewrite": "content.html#experiments",
  "/backlinks": "backlinks.html",
  "/link-building": "backlinks.html",
  "/outreach": "backlinks.html#outreach",
  "/broken-links": "backlinks.html#broken",
  "/gbp": "local-seo.html#gbp",
  "/citations": "local-seo.html#citations",
  "/local-rank": "local-seo.html#rank",
  "/local-grid": "local-seo.html#rank",
  "/competitors": "competitors.html",
  "/compare": "competitors.html#compare",
  "/brand-monitor": "competitors.html#brand",
  "/ai-visibility": "ai-visibility.html",
  "/chats": "ai-visibility.html",
  "/agent": "agent.html",
  "/agent/autopilot": "agent.html#control",
  "/automations": "automation.html",
  "/monitor": "automation.html#monitor",
  "/digest": "automation.html#alerts",
  "/snapshots": "automation.html#monitor",
  "/history": "automation.html#nightly",
  "/reports": "reports.html",
  "/proposals": "reports.html#proposals",
  "/invoices": "reports.html#proposals",
  "/connect": "integrations.html",
  "/settings": "integrations.html",
  "/settings/backup": "backup.html",
  "/tools": "tools.html",
  "/docs": "index.html",
  "/learn": "index.html",
};

/** The docs page for a screen, or the front page when nothing matches. */
export function docsUrlFor(pathname: string | null | undefined): string {
  const path = (pathname ?? "/").split("?")[0].replace(/\/+$/, "") || "/";

  let best = "";
  for (const prefix of Object.keys(ROUTE_DOCS)) {
    if (prefix === "/") continue;
    if ((path === prefix || path.startsWith(prefix + "/")) && prefix.length > best.length) {
      best = prefix;
    }
  }

  return DOCS_BASE + (best ? ROUTE_DOCS[best] : ROUTE_DOCS["/"]);
}

/** A named page, for links that are not about the current route. */
export function docsPage(page: keyof typeof DOCS_PAGES): string {
  return DOCS_BASE + DOCS_PAGES[page];
}

export const DOCS_PAGES = {
  home: "index.html",
  install: "install.html",
  firstRun: "first-run.html",
  backup: "backup.html",
  troubleshooting: "troubleshooting.html",
  integrations: "integrations.html",
  mcp: "mcp.html",
  agent: "agent.html",
  tools: "tools.html",
  screens: "screens.html",
  faq: "faq.html",
} as const;
