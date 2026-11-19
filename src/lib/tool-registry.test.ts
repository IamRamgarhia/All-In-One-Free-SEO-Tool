/**
 * No tool may exist in zero surfaces.
 *
 * This is the test that was missing. Measured on 19 Nov 2026, TEN
 * finished tools with their own PageHeader were in no nav group and no
 * tools grid, so the only way to reach them was typing the URL:
 *
 *   /ask ("Ask the tool", a headline feature in CLAUDE.md Part 14)
 *   /content-gap (content gap analysis, Part 7 §6)
 *   /bot-logs, /image-audit, /brand-serp, /knowledge-panel,
 *   /author-authority, /landing-perf, /links, /annotations
 *
 * A tenth of the product, built and paid for and invisible. Nothing
 * threw; every one of those pages rendered perfectly when asked. It is
 * the same failure shape as the rest of this repo's history — a silence,
 * not a crash — and the route sweep could not catch it, because the
 * sweep visits routes it discovers on disk and they all returned 200.
 *
 * So this walks src/app for pages that declare a title, and insists each
 * one is reachable from somewhere. It is deliberately a weak claim
 * (SOME surface, not a specific one), because the nav being a curated
 * subset of 93 tools is correct and a nav listing all of them would help
 * nobody.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { TOOLS, internalTools, searchableTools, toolByHref } from "./tool-registry";
import { NAV_ITEMS } from "@/components/shell/nav-items";
import { RETIRED, categoryOf, isRetired } from "./tool-categories";

const APP = join(process.cwd(), "src/app");

/**
 * Every route under src/app that has a page, as a URL path.
 *
 * Route groups `(group)` and private folders `_x` are skipped, matching
 * how Next resolves them.
 */
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

/** The `title="..."` a page passes to PageHeader, if any. */
function pageTitle(route: string): string | null {
  const file = join(APP, route === "/" ? "" : route.slice(1), "page.tsx");
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const m = src.match(/title="([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Routes that legitimately appear in no tool surface.
 *
 * Each needs a stated reason. This list is the pressure valve that keeps
 * the test honest: without it someone would weaken the assertion instead
 * of either surfacing a tool or explaining why it does not belong.
 */
const NOT_A_TOOL: Record<string, string> = {
  "/": "the dashboard itself",
  "/login": "auth, reached when you are not signed in",
  "/register": "auth",
  "/welcome": "the first-run stepper, linked from the dashboard gate",
  "/capture": "the browser-extension endpoint, opened by the extension",
  "/report-data": "a data view embedded in report rendering",
  "/shortcuts": "the keyboard-shortcut reference, opened from the palette",
  "/csv-import": "reached from /import, which is the surface for all imports",
};

describe("every page that looks like a tool is reachable", () => {
  it("has pages to check at all", () => {
    // Guards against the walk silently finding nothing, which would make
    // every assertion below vacuous.
    expect(pageRoutes().length).toBeGreaterThan(150);
  });

  it("no titled top-level page is absent from every surface", () => {
    const navHrefs = new Set(NAV_ITEMS.map((i) => i.href));
    const orphans: string[] = [];

    for (const route of pageRoutes()) {
      // Dynamic and nested routes are reached from their parent, not
      // from a nav item — /clients/[id] is where you land by clicking a
      // client.
      if (route.includes("[")) continue;
      if (route.split("/").filter(Boolean).length !== 1) continue;
      if (route in NOT_A_TOOL) continue;

      const title = pageTitle(route);
      // No PageHeader title means it is probably not a destination of
      // its own. A weak signal, but the ten orphans all had one.
      if (!title) continue;

      if (!navHrefs.has(route) && !toolByHref(route)) {
        orphans.push(`${route} ("${title}")`);
      }
    }

    expect(
      orphans,
      `These pages exist, have a title, and are in no nav group and no ` +
        `tools grid — so the only way to reach them is typing the URL:\n  ` +
        orphans.join("\n  ") +
        `\n\nAdd each to src/lib/tool-registry.ts (and give it a category ` +
        `in tool-categories.ts), add it to nav-items.ts, or list it in ` +
        `NOT_A_TOOL with the reason it is not a destination.`,
    ).toEqual([]);
  });
});

describe("the registry is the one list", () => {
  it("global search no longer keeps its own tool list", () => {
    // 83 entries copied from the grid, 8 of them retired. The comment
    // above it said "keep in sync", which is the instruction that does
    // not work.
    const src = readFileSync(
      join(process.cwd(), "src/app/search/actions.ts"),
      "utf8",
    );
    expect(src).toContain("searchableTools");
    const hardcoded = (src.match(/href: "\/tools\//g) ?? []).length;
    expect(
      hardcoded,
      `search/actions.ts hardcodes ${hardcoded} tool hrefs again`,
    ).toBe(0);
  });

  it("the grid reads the registry rather than its own array", () => {
    const src = readFileSync(
      join(process.cwd(), "src/app/tools/tools-grid.tsx"),
      "utf8",
    );
    expect(src).toContain("const tools = TOOLS");
    expect(src).not.toMatch(/^const tools = \[/m);
  });

  it("the capability generator imports the registry instead of parsing tsx", () => {
    // The parser it replaces needed a twelve-line lookahead to skip
    // comments between a key and its value, and had already dropped a
    // tool from the docs without a word.
    const src = readFileSync(
      join(process.cwd(), "scripts/gen-tool-capabilities.ts"),
      "utf8",
    );
    expect(src).toContain('from "../src/lib/tool-registry"');
    expect(src).not.toContain("src/app/tools/tools-grid.tsx");
  });
});

describe("search offers current tools only", () => {
  it("drops every retired tool", () => {
    // Eight retired tools were being offered by name while their
    // replacements sat in the same list.
    const offered = searchableTools().map((t) => t.href);
    const retiredOffered = offered.filter((h) => h in RETIRED);
    expect(
      retiredOffered,
      `search offers retired tools: ${retiredOffered
        .map((h) => `${h} (use ${RETIRED[h].useInstead})`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("still offers plenty, so the filter has not eaten the list", () => {
    expect(searchableTools().length).toBeGreaterThan(70);
  });

  it("drops the external card, which is not a route here", () => {
    const external = internalTools().filter((t) => !t.href.startsWith("/"));
    expect(external).toEqual([]);
  });
});

describe("registry entries are well formed", () => {
  it("every href is unique", () => {
    const seen = new Map<string, number>();
    for (const t of TOOLS) seen.set(t.href, (seen.get(t.href) ?? 0) + 1);
    const dupes = [...seen].filter(([, n]) => n > 1).map(([h]) => h);
    expect(dupes).toEqual([]);
  });

  it("every entry has a title, a description and an icon", () => {
    for (const t of TOOLS) {
      expect(t.title.length, `${t.href} needs a title`).toBeGreaterThan(2);
      expect(
        t.description.length,
        `${t.href} needs a description a user could read`,
      ).toBeGreaterThan(30);
      expect(t.icon, `${t.href} needs an icon`).toBeTruthy();
    }
  });

  it("the ten recovered tools are present and not filed under 'occasional' by accident", () => {
    // The default category is "occasional", which is collapsed in the
    // grid — so landing there by omission would take them from invisible
    // to nearly invisible.
    const recovered = [
      "/ask",
      "/content-gap",
      "/bot-logs",
      "/image-audit",
      "/brand-serp",
      "/knowledge-panel",
      "/author-authority",
      "/landing-perf",
      "/annotations",
    ];
    for (const href of recovered) {
      expect(toolByHref(href), `${href} missing from the registry`).toBeTruthy();
      expect(isRetired(href)).toBe(false);
      expect(
        categoryOf(href),
        `${href} has no explicit category, so it defaults to a collapsed group`,
      ).not.toBe("occasional");
    }
    // /links is deliberately "occasional" — it is a utility, not a
    // diagnostic — so it is asserted separately rather than excused by a
    // weaker rule above.
    expect(toolByHref("/links")).toBeTruthy();
    expect(categoryOf("/links")).toBe("occasional");
  });
});
