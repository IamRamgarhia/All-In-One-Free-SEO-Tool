/**
 * Settings tabs: every section reachable, every deep link real.
 *
 * Tabs make two new ways to lose a setting, and neither throws:
 *
 *   1. A section no tab owns is hidden on every tab. The card is still
 *      in the DOM, still server-rendered, and invisible forever.
 *   2. A `settings#x` link elsewhere in the app that names a section no
 *      tab owns now lands on a tab that does not show it — where before
 *      it merely scrolled to the wrong place.
 *
 * Writing this found two links that were already dead before tabs
 * existed: `settings#smtp` (the section is #email) and
 * `settings#integrations` (no such section — and for wp-bridge, not even
 * a Settings page concern; it is configured per client).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTINGS_TABS } from "./settings-tab-map";

const ROOT = process.cwd();
const PAGE = join(ROOT, "src/app/settings/page.tsx");

/** Direct children of #settings-panels carry these ids. */
function renderedSectionIds(): string[] {
  const src = readFileSync(PAGE, "utf8");
  const panels = src.slice(
    src.indexOf("<SettingsTabs"),
    src.indexOf("</SettingsTabs>"),
  );
  // Top-level children are indented six spaces inside the wrapper.
  const ids: string[] = [];
  for (const line of panels.split(/\r?\n/)) {
    if (!/^ {6}<(section|div)\b/.test(line) && !/^ {8}id="/.test(line)) continue;
    const m = line.match(/id="([a-z0-9-]+)"/);
    if (m) ids.push(m[1]);
  }
  return [...new Set(ids)];
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

const owned = new Map<string, string>();
for (const tab of SETTINGS_TABS) {
  for (const s of tab.sections) owned.set(s, tab.id);
}

describe("settings tabs", () => {
  it("found the sections, so the rest of this file checks something", () => {
    const ids = renderedSectionIds();
    expect(ids.length).toBeGreaterThanOrEqual(12);
    expect(ids).toContain("ai");
    expect(ids).toContain("privacy");
  });

  it("gives every rendered section exactly one tab", () => {
    const orphans = renderedSectionIds().filter((id) => !owned.has(id));
    expect(
      orphans,
      "these sections are hidden on every tab, because no tab claims them",
    ).toEqual([]);
  });

  it("claims no section twice", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const tab of SETTINGS_TABS) {
      for (const s of tab.sections) {
        if (seen.has(s)) dupes.push(s);
        seen.add(s);
      }
    }
    expect(dupes).toEqual([]);
  });

  it("claims no section the page does not render", () => {
    const rendered = new Set(renderedSectionIds());
    // #update is nested inside #install (update-card.tsx), so it is a
    // legitimate deep-link target without being a direct child.
    const nested = new Set(["update"]);
    const ghosts = [...owned.keys()].filter(
      (s) => !rendered.has(s) && !nested.has(s),
    );
    expect(ghosts, "these tabs point at sections that do not exist").toEqual([]);
  });

  it("every settings# link in the app names a section a tab shows", () => {
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
          bad.push(`${file.slice(ROOT.length + 1).replace(/\\/g, "/")} -> #${m[1]}`);
        }
      }
    }
    expect(bad, "these links scroll to nothing").toEqual([]);
  });
});
