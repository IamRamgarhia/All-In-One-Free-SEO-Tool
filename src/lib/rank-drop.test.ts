import { describe, expect, it } from "vitest";
import { isRankDrop } from "./rank-drop";

describe("a ranking drop", () => {
  it("is five places or more", () => {
    expect(isRankDrop(12, 17)).toBe(true);
    expect(isRankDrop(12, 16)).toBe(false);
  });
  it("is leaving the top 10, results included", () => {
    expect(isRankDrop(8, 11)).toBe(true);
    expect(isRankDrop(8, null)).toBe(true);
    expect(isRankDrop(25, null)).toBe(false);
  });
  it("needs a previous position, and a rise is not a drop", () => {
    expect(isRankDrop(null, 50)).toBe(false);
    expect(isRankDrop(9, 3)).toBe(false);
  });
});
