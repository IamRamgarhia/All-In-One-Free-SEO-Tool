import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/shell/nav-items";
import { isRetired } from "./tool-categories";
import { TOOLS } from "./tool-registry";
import {
  PROJECT_VIEWS,
  TOOL_FAMILIES,
  familyEntry,
  familyOf,
  familyTabHref,
  projectIdOfRoute,
} from "./tool-families";
import {
  DEFAULT_DISABLED,
  MISSION_CATEGORIES,
  TOOL_CATALOG,
  catalogEntry,
  isToolDisabled,
} from "./tool-catalog";

const APP = path.resolve(__dirname, "../app");
const pageExists = (href: string) => existsSync(path.join(APP, href, "page.tsx"));

/** The sidebar's own entries and the account links are not tools. */
const NOT_TOOLS = new Set([
  "/",
  "/clients",
  "/tasks",
  "/seo-chat",
  "/audits",
  "/reports",
  "/leads",
  "/welcome",
  "/settings",
  "/docs",
  "/learn",
]);

/**
 * Reference pages rather than tools: a fixed text and a list of outside
 * links. They are reached from Resources (/knowledge), which links them.
 */
const IN_RESOURCES = ["/tools/ai-citation-tactics", "/tools/external"];

/** In the catalogue under its own card, or as a tab of a family's card. */
const listed = (href: string) => Boolean(catalogEntry(familyEntry(href) ?? href));

describe("tool catalogue", () => {
  it("lists each tool once, in a known category, on a real page", () => {
    const hrefs = TOOL_CATALOG.map((e) => e.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const e of TOOL_CATALOG) {
      expect(MISSION_CATEGORIES).toContain(e.category);
      expect(pageExists(e.href), e.href).toBe(true);
    }
  });

  it("keeps every page the old menu listed", () => {
    const missing = NAV_GROUPS.flatMap((g) => g.items)
      .map((it) => it.href)
      .filter((h) => !NOT_TOOLS.has(h) && !listed(h));
    expect(missing).toEqual([]);
  });

  it("keeps every tool of the registry", () => {
    const hrefs = TOOLS.map((t) => t.href);
    expect(hrefs.length).toBeGreaterThan(50);
    const missing = hrefs.filter(
      (h) => !isRetired(h) && !listed(h) && !IN_RESOURCES.includes(h),
    );
    expect(missing).toEqual([]);
  });

  it("links the reference pages from Resources instead", () => {
    for (const lang of ["fr", "en"]) {
      const hub = readFileSync(path.join(APP, `knowledge/knowledge-${lang}.tsx`), "utf8");
      for (const href of IN_RESOURCES) {
        expect(catalogEntry(href), href).toBeNull();
        expect(hub, `${lang} ${href}`).toContain(`href="${href}"`);
      }
    }
  });

  it("turns off by default only tools outside SEO work or behind a paid key", () => {
    expect([...DEFAULT_DISABLED].sort()).toEqual([
      "/tools/ads-funnel",
      "/tools/image-gen",
      "/tools/programmatic-seo",
      "/tools/reputation-abuse-risk",
      "/tools/utm-attribution",
      "/tools/youtube",
      "/tools/youtube-audit",
    ]);
  });
});

describe("isToolDisabled", () => {
  const off = new Set(["/tools/geo-swot", "/reports"]);

  it("covers the tool and its per-client view, with or without a query", () => {
    expect(isToolDisabled("/tools/geo-swot", off)).toBe(true);
    expect(isToolDisabled("/tools/geo-swot/c/4", off)).toBe(true);
    expect(isToolDisabled("/tools/geo-swot?clientId=4", off)).toBe(true);
  });

  it("leaves other tools alone", () => {
    expect(isToolDisabled("/reports/batch", off)).toBe(false);
    expect(isToolDisabled("/tools/geo-score", off)).toBe(false);
    expect(isToolDisabled("/tools/geo-swot", new Set())).toBe(false);
  });
});

describe("tool families", () => {
  it("lists one card per family, under its first tab", () => {
    for (const f of TOOL_FAMILIES) {
      const [entry, ...tabs] = f.members;
      expect(catalogEntry(entry.href), f.id).not.toBeNull();
      for (const m of tabs) expect(catalogEntry(m.href), m.href).toBeNull();
      for (const m of f.members) expect(pageExists(m.href), m.href).toBe(true);
    }
  });

  it("puts a tool in one family only", () => {
    const hrefs = TOOL_FAMILIES.flatMap((f) => f.members.map((m) => m.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("names every family and tab in both languages", () => {
    for (const lang of ["fr", "en"]) {
      const msgs = JSON.parse(
        readFileSync(path.resolve(__dirname, `../../messages/${lang}.json`), "utf8"),
      ).toolFamilies as Record<string, { title?: string; tabs?: Record<string, string> }>;
      for (const f of TOOL_FAMILIES) {
        expect(msgs[f.id]?.title, `${lang} ${f.id}`).toBeTruthy();
        for (const m of f.members) expect(msgs[f.id]?.tabs?.[m.tab], `${lang} ${f.id}.${m.tab}`).toBeTruthy();
      }
    }
  });

  it("knows which members have a page inside a project", () => {
    for (const f of TOOL_FAMILIES) {
      for (const m of f.members) {
        expect(PROJECT_VIEWS.has(m.href), m.href).toBe(pageExists(`${m.href}/c/[clientId]`));
      }
    }
  });

  it("keeps every tab inside the project", () => {
    expect(familyTabHref("/cwv", null)).toBe("/cwv");
    expect(familyTabHref("/cwv", { id: 4 })).toBe("/cwv/c/4");
    expect(familyTabHref("/tools/crux", { id: 4, url: "https://a.fr/" })).toBe(
      "/tools/crux?clientId=4&url=https%3A%2F%2Fa.fr%2F",
    );
    expect(projectIdOfRoute("/cwv/c/4")).toBe(4);
    expect(projectIdOfRoute("/content/c/4/p/9")).toBe(4);
    expect(projectIdOfRoute("/clients/4")).toBe(4);
    expect(projectIdOfRoute("/tools/crux")).toBeNull();
  });

  it("matches sub-pages but not tools that share a prefix", () => {
    expect(familyOf("/backlinks/c/4")?.family.id).toBe("backlinks");
    expect(familyOf("/agent/autopilot")?.member.tab).toBe("autopilot");
    expect(familyOf("/agent")?.member.tab).toBe("agent");
    expect(familyOf("/content/c/2/p/9")?.family.id).toBe("studio");
    expect(familyOf("/content-gap")).toBeNull();
    expect(familyOf("/tools/schema?url=x")?.family.id).toBe("schema");
  });

  it("turns a whole family off with its card", () => {
    const off = new Set(["/tools/health-check"]);
    expect(isToolDisabled("/grader", off)).toBe(true);
    expect(isToolDisabled("/tools/bulk-scan", off)).toBe(true);
    expect(isToolDisabled("/compare", off)).toBe(false);
  });
});
