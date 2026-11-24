import { describe, expect, it } from "vitest";
import { CATEGORY_LABELS } from "./seo-resources-categories";
import { CATEGORY_LABELS_FR } from "./seo-resources-categories.fr";

describe("French resource categories", () => {
  it("names every category", () => {
    expect(Object.keys(CATEGORY_LABELS_FR).sort()).toEqual(Object.keys(CATEGORY_LABELS).sort());
  });
});
