import { describe, expect, it } from "vitest";
import { TARGETS, TARGET_GROUPS } from "./code-generator-types";
import { TARGETS_FR, TARGET_GROUP_LABELS_FR } from "./code-generator-types.fr";

describe("French code generator targets", () => {
  it("translates every target, step for step", () => {
    expect(Object.keys(TARGETS_FR).sort()).toEqual(Object.keys(TARGETS).sort());
    for (const [id, en] of Object.entries(TARGETS)) {
      const fr = TARGETS_FR[id as keyof typeof TARGETS];
      expect(fr.installSteps.length, id).toBe(en.installSteps.length);
      expect(Boolean(fr.warning), id).toBe(Boolean(en.warning));
      expect(fr.label.trim(), id).not.toBe("");
      expect(fr.description.trim(), id).not.toBe("");
    }
  });

  it("names every group", () => {
    for (const g of TARGET_GROUPS) expect(TARGET_GROUP_LABELS_FR[g.label], g.label).toBeTruthy();
  });
});
