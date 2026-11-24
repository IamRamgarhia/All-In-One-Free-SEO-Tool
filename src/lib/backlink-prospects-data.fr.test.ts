import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  COUNTRY_LABELS,
  NICHE_LABELS,
  PROSPECTS,
} from "./backlink-prospects-data";
import {
  CATEGORY_LABELS_FR,
  COUNTRY_LABELS_FR,
  NICHE_LABELS_FR,
  PROSPECTS_FR,
  prospectKey,
} from "./backlink-prospects-data.fr";

describe("French prospects library", () => {
  it("translates every prospect, step for step", () => {
    const keys = PROSPECTS.map(prospectKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(Object.keys(PROSPECTS_FR).sort()).toEqual([...keys].sort());
    for (const p of PROSPECTS) {
      const fr = PROSPECTS_FR[prospectKey(p)];
      expect(fr.description.trim(), p.name).not.toBe("");
      expect(fr.howTo.length, p.name).toBe(p.howTo.length);
    }
  });

  it("names every category, country and niche", () => {
    expect(Object.keys(CATEGORY_LABELS_FR).sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
    expect(Object.keys(COUNTRY_LABELS_FR).sort()).toEqual(Object.keys(COUNTRY_LABELS).sort());
    expect(Object.keys(NICHE_LABELS_FR).sort()).toEqual(Object.keys(NICHE_LABELS).sort());
  });
});
