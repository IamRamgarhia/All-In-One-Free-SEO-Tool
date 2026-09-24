import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCS_BASE, DOCS_PAGES, docsPage, docsUrlFor } from "./docs-links";

/**
 * The help button is on 195 screens. A link that 404s from there is
 * worse than no link: it is offered at the exact moment someone is
 * already stuck, and it teaches them the docs are not worth trying.
 *
 * So every page this map can produce has to exist in docs-site/, which
 * is checked against the source content rather than a built folder —
 * dist/ is generated and gitignored, so a test that read it would pass
 * or fail depending on whether someone had run a build.
 */

const ROOT = process.cwd();
const CONTENT = join(ROOT, "docs-site", "content.mjs");

/** Slugs the written pages define, plus the two generated ones. */
function knownSlugs(): Set<string> {
  const src = existsSync(CONTENT) ? readFileSync(CONTENT, "utf8") : "";
  const slugs = [...src.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  // reference.mjs builds these two from the app's own source.
  slugs.push("tools.html", "screens.html");
  return new Set(slugs);
}

describe("documentation links", () => {
  const slugs = knownSlugs();

  it("finds the docs content to check against", () => {
    expect(existsSync(CONTENT), "docs-site/content.mjs is missing").toBe(true);
    expect(slugs.size).toBeGreaterThan(15);
  });

  it("every named page exists", () => {
    for (const key of Object.keys(DOCS_PAGES) as (keyof typeof DOCS_PAGES)[]) {
      const file = DOCS_PAGES[key];
      expect(slugs.has(file.split("#")[0]), `DOCS_PAGES.${key} -> ${file} does not exist`).toBe(true);
      expect(docsPage(key).startsWith(DOCS_BASE)).toBe(true);
    }
  });

  it("every route in the map points at a page that exists", () => {
    // Exercised through the public function, so the map cannot be right
    // while the lookup is wrong.
    const routes = [
      "/", "/welcome", "/clients", "/audits", "/tasks", "/morning", "/keywords",
      "/cannibalization", "/content", "/title-tests", "/backlinks", "/outreach",
      "/gbp", "/citations", "/local-rank", "/competitors", "/compare",
      "/ai-visibility", "/agent", "/agent/autopilot", "/automations", "/monitor",
      "/reports", "/proposals", "/connect", "/settings", "/settings/backup",
      "/tools", "/docs",
    ];
    for (const route of routes) {
      const url = docsUrlFor(route);
      const file = url.slice(DOCS_BASE.length).split("#")[0];
      expect(slugs.has(file), `${route} -> ${file} does not exist`).toBe(true);
    }
  });

  it("sends an unknown screen to the front page rather than nowhere", () => {
    expect(docsUrlFor("/something/nobody/added")).toBe(DOCS_BASE + "index.html");
    expect(docsUrlFor(null)).toBe(DOCS_BASE + "index.html");
  });

  it("picks the most specific match, not the first", () => {
    // /agent/autopilot must not resolve to the /agent page just because
    // that prefix also matches.
    expect(docsUrlFor("/agent/autopilot")).toContain("#control");
    expect(docsUrlFor("/settings/backup")).toContain("backup.html");
    expect(docsUrlFor("/settings")).toContain("integrations.html");
  });

  it("handles a trailing slash and a query string", () => {
    expect(docsUrlFor("/audits/")).toBe(docsUrlFor("/audits"));
    expect(docsUrlFor("/audits?id=3")).toBe(docsUrlFor("/audits"));
  });

  it("nested client routes inherit their section's page", () => {
    expect(docsUrlFor("/audits/c/4")).toBe(docsUrlFor("/audits"));
    expect(docsUrlFor("/clients/12/onboarding")).toBe(docsUrlFor("/clients"));
  });
});
