/**
 * No tool may exist in zero surfaces, and the registry is the one list.
 *
 * Upstream found ten finished pages (ask the AI, content gap, AI bot
 * logs, image audit, brand SERP, Knowledge Panel, author authority,
 * landing-page performance, short links, annotations) reachable only by
 * typing their address. Here they were already in Settings → Tools, but
 * not in global search, which kept its own English list of 83 tools,
 * eight of them retired.
 *
 * The first check walks src/app for top-level pages with a PageHeader and
 * insists each is reachable from somewhere: the sidebar, the catalogue in
 * Settings → Tools (on its own card or as a family tab), or the registry.
 * Deliberately a weak claim (SOME surface), because that is the real
 * invariant.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { resolveToolCopy, translatorFrom } from "./i18n/tool-copy";
import { catalogEntry } from "./tool-catalog";
import { familyEntry } from "./tool-families";
import { RETIRED } from "./tool-categories";
import { TOOLS, searchableTools, toolByHref, toolIcon } from "./tool-registry";

const ROOT = process.cwd();
const APP = join(ROOT, "src/app");

/** Every route under src/app that has a page, as a URL path. */
function pageRoutes(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry.startsWith("_") || entry.startsWith("(")) continue;
        walk(full);
        continue;
      }
      if (entry !== "page.tsx") continue;
      const rel = relative(APP, dir).split(sep).join("/");
      out.push(rel === "" ? "/" : `/${rel}`);
    }
  })(APP);
  return out.sort();
}

function hasPageHeader(route: string): boolean {
  const file = join(APP, route === "/" ? "" : route.slice(1), "page.tsx");
  try {
    return readFileSync(file, "utf8").includes("<PageHeader");
  } catch {
    return false;
  }
}

/**
 * Top-level pages that legitimately appear in no tool surface, each with
 * its reason. Without this list someone would weaken the assertion
 * instead of either surfacing a page or saying why it is not one.
 */
const NOT_A_TOOL: Record<string, string> = {
  "/about": "about the project, linked from the profile menu",
  "/login": "sign-in, reached when you are not signed in",
  "/register": "account creation",
  "/welcome": "the first-run guide, linked from the dashboard",
  "/shortcuts": "the keyboard-shortcut reference, opened from the palette",
};

const navHrefs = new Set(NAV_ITEMS.map((i) => i.href));
const inCatalogue = (href: string) => Boolean(catalogEntry(familyEntry(href) ?? href));
const reachable = (href: string) =>
  navHrefs.has(href) || inCatalogue(href) || toolByHref(href) !== null;

const messages = (lang: "fr" | "en") => {
  const json = (file: string) => JSON.parse(readFileSync(join(ROOT, "messages", file), "utf8"));
  const main = json(`${lang}.json`);
  return {
    settings: translatorFrom(main.settings?.tools ?? {}),
    catalog: translatorFrom(json(`tools-catalog.${lang}.json`)),
    nav: translatorFrom(main.nav?.items ?? {}),
  };
};

/** The ten pages the upstream registry recovered. */
const RECOVERED = [
  "/ask",
  "/content-gap",
  "/bot-logs",
  "/image-audit",
  "/brand-serp",
  "/knowledge-panel",
  "/author-authority",
  "/landing-perf",
  "/links",
  "/annotations",
];

describe("every page that looks like a tool is reachable", () => {
  it("has pages to check at all", () => {
    expect(pageRoutes().length).toBeGreaterThan(150);
  });

  it("no top-level page with a header is absent from every surface", () => {
    const orphans = pageRoutes().filter(
      (route) =>
        !route.includes("[") &&
        route.split("/").filter(Boolean).length === 1 &&
        !(route in NOT_A_TOOL) &&
        hasPageHeader(route) &&
        !reachable(route),
    );
    expect(
      orphans,
      `These pages exist and are in no menu, no catalogue card and not in ` +
        `the tool registry, so the only way in is typing the address. Add ` +
        `each to src/lib/tool-registry.ts or tool-catalog.ts, or list it in ` +
        `NOT_A_TOOL with the reason it is not a destination.`,
    ).toEqual([]);
  });

  it("the ten recovered pages are in the registry and the catalogue", () => {
    for (const href of RECOVERED) {
      expect(toolByHref(href), `${href} missing from the registry`).not.toBeNull();
      expect(inCatalogue(href), `${href} missing from Settings → Tools`).toBe(true);
      expect(searchableTools().some((t) => t.href === href), href).toBe(true);
    }
  });
});

describe("the registry is the one list", () => {
  it("global search derives its tools from the registry", () => {
    const src = readFileSync(join(APP, "search/actions.ts"), "utf8");
    expect(src).toContain("searchableTools");
    expect(src.match(/href: "\/tools\//g) ?? []).toEqual([]);
  });

  it("the capability generator imports the registry instead of parsing tsx", () => {
    const src = readFileSync(join(ROOT, "scripts/gen-tool-capabilities.ts"), "utf8");
    expect(src).toContain('from "../src/lib/tool-registry"');
    expect(src).not.toContain("tools-grid.tsx\"");
  });

  it("search offers no retired tool, and still offers plenty", () => {
    const offered = searchableTools().map((t) => t.href);
    expect(offered.filter((h) => h in RETIRED)).toEqual([]);
    expect(offered.length).toBeGreaterThan(70);
  });
});

describe("registry entries are well formed", () => {
  it("every href is unique and has an icon", () => {
    const hrefs = TOOLS.map((t) => t.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const t of TOOLS) expect(toolIcon(t.href), t.href).toBeTruthy();
  });

  it("every tool is named and described in French and in English", () => {
    for (const lang of ["fr", "en"] as const) {
      const src = messages(lang);
      const missing = TOOLS.filter((t) => {
        const copy = resolveToolCopy(t.href, src);
        return !copy || copy.description.length < 10;
      }).map((t) => t.href);
      expect(missing, `${lang}: no title or description for`).toEqual([]);
    }
  });

  it("takes names from the translations, not from English written in code", () => {
    const src = readFileSync(join(ROOT, "src/lib/tool-registry.ts"), "utf8");
    expect(src).not.toMatch(/\btitle:\s*"/);
    expect(src).not.toMatch(/\bdescription:\s*"/);
  });
});
