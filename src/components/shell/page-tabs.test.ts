/**
 * Tabs: every section reachable, every deep link real.
 *
 * Tabs add two ways to lose a whole section of a page, and neither
 * throws, logs, or shows up in a build:
 *
 *   1. A section no tab owns is hidden on every tab. The card is still
 *      in the DOM, still server-rendered, and invisible forever.
 *   2. A tab that names a section the page does not render produces a
 *      tab that shows nothing at all.
 *
 * Both are silent, which is why they are tested rather than reviewed.
 * Writing the first version of this for Settings found three deep links
 * that were already dead before tabs existed: two `settings#smtp` (the
 * section is #email) and `settings#integrations` (no such section — and
 * for wp-bridge, not even a Settings concern; it is configured per
 * client).
 *
 * Three pages use tabs now, so this checks all three from one table
 * rather than existing three times.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PageTab } from "./page-tabs";
import { SETTINGS_TABS } from "@/app/settings/settings-tab-map";
import { KNOWLEDGE_TABS } from "@/app/knowledge/knowledge-tab-map";
import { CLIENT_TABS } from "@/app/clients/[id]/client-tab-map";

const ROOT = process.cwd();

/** Source between the PageTabs open and close tags. */
function panelRegion(src: string): string {
  return src.slice(src.indexOf("<PageTabs"), src.indexOf("</PageTabs>"));
}

type TabbedPage = {
  name: string;
  file: string;
  panelId: string;
  tabs: readonly PageTab[];
  /** Ids of the panel's direct children, as found in the source. */
  sectionIds: (src: string) => string[];
  /** Guards the extractor: if it silently finds nothing, everything passes. */
  minSections: number;
  mustContain: string[];
  /** Deep-link targets nested inside a section rather than being one. */
  nested?: string[];
};

const PAGES: TabbedPage[] = [
  {
    name: "settings",
    file: "src/app/settings/page.tsx",
    panelId: "settings-panels",
    tabs: SETTINGS_TABS,
    // Cards written inline on the page, each carrying its own id.
    sectionIds: (src) => {
      const ids: string[] = [];
      for (const line of panelRegion(src).split(/\r?\n/)) {
        if (!/^ {6}<(section|div)\b/.test(line) && !/^ {8}id="/.test(line))
          continue;
        const m = line.match(/id="([a-z0-9-]+)"/);
        if (m) ids.push(m[1]);
      }
      return [...new Set(ids)];
    },
    minSections: 12,
    mustContain: ["ai", "privacy"],
    // #update is nested inside #install (update-card.tsx), so it is a
    // legitimate deep-link target without being a direct child.
    nested: ["update"],
  },
  {
    name: "knowledge",
    file: "src/app/knowledge/page.tsx",
    panelId: "knowledge-panels",
    tabs: KNOWLEDGE_TABS,
    // The guides are <Section id="..."> components rendered in the panel;
    // Section puts the id on its own root <section>, so those are the
    // DOM children the CSS acts on. Read from the whole file, because
    // the definitions sit below the panel.
    sectionIds: (src) => {
      const ids = [
        ...src.matchAll(/<Section\b[\s\S]{0,80}?id="([a-z0-9-]+)"/g),
      ].map((m) => m[1]);
      for (const m of panelRegion(src).matchAll(
        /<section\b[^>]*id="([a-z0-9-]+)"/g,
      )) {
        ids.push(m[1]);
      }
      return [...new Set(ids)];
    },
    minSections: 12,
    mustContain: ["ranking-signals", "gbp", "playbooks"],
  },
  {
    name: "clients/[id]",
    file: "src/app/clients/[id]/page.tsx",
    panelId: "client-panels",
    tabs: CLIENT_TABS,
    // This page groups into wrapper divs instead of id-ing each section
    // — see client-tab-map.ts for why.
    sectionIds: (src) => [
      ...new Set(
        [...panelRegion(src).matchAll(/<div id="(client-[a-z-]+-panel)"/g)].map(
          (m) => m[1],
        ),
      ),
    ],
    minSections: 5,
    mustContain: ["client-overview-panel", "client-manage-panel"],
  },
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe.each(PAGES)("$name tabs", (page) => {
  const src = readFileSync(join(ROOT, page.file), "utf8");
  const rendered = page.sectionIds(src);
  const owned = new Map<string, string>();
  for (const tab of page.tabs) {
    for (const s of tab.sections) owned.set(s, tab.id);
  }

  it("found the sections, so the rest of these checks mean something", () => {
    expect(rendered.length).toBeGreaterThanOrEqual(page.minSections);
    for (const id of page.mustContain) expect(rendered).toContain(id);
  });

  it("renders the panel wrapper the tab CSS selects on", () => {
    // The generated stylesheet targets #<panelId>. A mismatch between
    // the map and the page means every rule misses and every section
    // shows on every tab — tabs that quietly do nothing.
    expect(src).toContain(`panelId="${page.panelId}"`);
  });

  it("gives every rendered section exactly one tab", () => {
    const orphans = rendered.filter((id) => !owned.has(id));
    expect(
      orphans,
      "these sections are hidden on every tab, because no tab claims them",
    ).toEqual([]);
  });

  it("claims no section twice", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const tab of page.tabs) {
      for (const s of tab.sections) {
        if (seen.has(s)) dupes.push(s);
        seen.add(s);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("claims no section the page does not render", () => {
    const have = new Set(rendered);
    const nested = new Set(page.nested ?? []);
    const ghosts = [...owned.keys()].filter(
      (s) => !have.has(s) && !nested.has(s),
    );
    expect(ghosts, "these tabs point at sections that do not exist").toEqual(
      [],
    );
  });

  it("has at least two tabs, and a label on each", () => {
    expect(page.tabs.length).toBeGreaterThan(1);
    for (const t of page.tabs) expect(t.label.trim()).not.toBe("");
  });
});

describe("across pages", () => {
  it("gives every page a distinct panel id", () => {
    // The stylesheet is global. Two pages sharing a panel id would have
    // one page's rules hiding the other page's sections.
    const ids = PAGES.map((p) => p.panelId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every settings# link in the app names a section a tab shows", () => {
    const owned = new Set(SETTINGS_TABS.flatMap((t) => [...t.sections]));
    const bad: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      // Only real hrefs: the anchor has to be followed by the quote or
      // backtick that closes the string. Without this the guard reads
      // prose, and the first thing it flagged was the comment explaining
      // one of the dead links it had just found.
      for (const m of text.matchAll(/settings#([a-z0-9-]+)(?=["'`])/g)) {
        if (!owned.has(m[1])) {
          bad.push(
            `${file.slice(ROOT.length + 1).replace(/\\/g, "/")} -> #${m[1]}`,
          );
        }
      }
    }
    expect(bad, "these links scroll to nothing").toEqual([]);
  });

  it("every knowledge contents link names a section a tab shows", () => {
    // The table of contents stays outside the tabs and lists all of
    // them, so each entry has to resolve to a tab that can show it.
    const owned = new Set(KNOWLEDGE_TABS.flatMap((t) => [...t.sections]));
    const src = readFileSync(join(ROOT, "src/app/knowledge/page.tsx"), "utf8");
    const toc = src.slice(
      src.indexOf("function Toc()"),
      src.indexOf("function Section("),
    );
    const ids = [...toc.matchAll(/id: "([a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids.filter((id) => !owned.has(id))).toEqual([]);
  });
});
