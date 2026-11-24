import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aiNeedOf, connectionCoverage, groupByMission } from "./connection-coverage";
import { AI_TOOL_COUNT } from "./tool-capabilities";
import { TOOL_CATALOG } from "./tool-catalog";
import { resolveToolCopy, translatorFrom } from "./i18n/tool-copy";

const cov = connectionCoverage();

describe("connection coverage", () => {
  it("puts every catalogue tool in exactly one AI group", () => {
    const all = [...cov.needsKey, ...cov.partlyKey, ...cov.noAi].map((t) => t.href);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(TOOL_CATALOG.map((e) => e.href).sort());
    expect(cov.total).toBe(TOOL_CATALOG.length);
  });

  it("has something in each group, so the screens are not describing empty lists", () => {
    expect(cov.needsKey.length).toBeGreaterThan(0);
    expect(cov.partlyKey.length).toBeGreaterThan(0);
    expect(cov.noAi.length).toBeGreaterThan(0);
    expect(cov.needsGsc.length).toBeGreaterThan(0);
  });

  it("does not count as 'needs a key' the tools that run without one", () => {
    // AI_TOOL_COUNT counts every page that can reach a model; a key
    // unlocks fewer than that, which is what the screens used to over-state.
    expect(cov.needsKey.length).toBeLessThan(AI_TOOL_COUNT);
    for (const t of cov.partlyKey) expect(aiNeedOf(t.href)).toBe("partial");
    for (const t of cov.noAi) expect(aiNeedOf(t.href)).toBe("none");
  });

  it("lists the Search Console tools the catalogue marks", () => {
    expect(cov.needsGsc.map((t) => t.href).sort()).toEqual(
      TOOL_CATALOG.filter((e) => e.needs === "gsc").map((e) => e.href).sort(),
    );
  });

  it("groups without losing or duplicating a tool", () => {
    const grouped = groupByMission(cov.needsKey).flatMap((g) => g.tools);
    expect(grouped.length).toBe(cov.needsKey.length);
  });

  it("can name every listed tool in French and in English", () => {
    for (const lang of ["fr", "en"] as const) {
      const read = (f: string) =>
        JSON.parse(readFileSync(join(process.cwd(), "messages", f), "utf8"));
      const main = read(`${lang}.json`);
      const src = {
        settings: translatorFrom(main.settings.tools),
        catalog: translatorFrom(read(`tools-catalog.${lang}.json`)),
        nav: translatorFrom(main.nav.items),
      };
      const unnamed = [...cov.needsKey, ...cov.partlyKey, ...cov.needsGsc]
        .filter((t) => !resolveToolCopy(t.href, src))
        .map((t) => t.href);
      expect(unnamed, lang).toEqual([]);
    }
  });

  it("Settings → Tools classes cards with the same rule", () => {
    const src = readFileSync(join(process.cwd(), "src/app/settings/tools/page.tsx"), "utf8");
    expect(src).toContain("aiNeedOf(");
  });
});
