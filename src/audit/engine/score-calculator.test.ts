import { describe, expect, it } from "vitest";
import {
  applyCaps,
  calculateCategoryScore,
  calculateOverallScore,
} from "./score-calculator";
import { diffRuleStatuses } from "./diff-engine";

describe("calculateCategoryScore", () => {
  it("weights fails harder when weight is high", () => {
    const low = calculateCategoryScore([
      { status: "fail", weight: 1, message: "" },
      { status: "pass", weight: 1, message: "" },
    ]);
    const high = calculateCategoryScore([
      { status: "fail", weight: 25, message: "" },
      { status: "pass", weight: 1, message: "" },
    ]);
    expect(high).toBeLessThan(low);
  });

  it("ignores unmeasured", () => {
    expect(
      calculateCategoryScore([
        { status: "unmeasured", weight: 0, message: "" },
        { status: "pass", weight: 10, message: "" },
      ]),
    ).toBe(100);
  });
});

describe("applyCaps", () => {
  it("caps a healthy-looking score on noindex", () => {
    const { score, applied } = applyCaps(92, [
      { id: "noindex", ceiling: 20, reason: "noindex" },
    ]);
    expect(score).toBe(20);
    expect(applied).toHaveLength(1);
  });
});

describe("calculateOverallScore", () => {
  it("renormalizes over categories with measured results", () => {
    const score = calculateOverallScore([
      {
        categoryId: "core",
        score: 80,
        pass: 1,
        warn: 0,
        fail: 0,
        unmeasured: 0,
        results: [],
      },
      {
        categoryId: "technical",
        score: 40,
        pass: 0,
        warn: 0,
        fail: 1,
        unmeasured: 0,
        results: [],
      },
    ]);
    expect(score).toBeGreaterThan(40);
    expect(score).toBeLessThan(80);
  });
});

describe("diffRuleStatuses", () => {
  it("detects fixed and regressed rules", () => {
    const diff = diffRuleStatuses(
      { "core-title-present": "fail", "technical-https": "pass" },
      { "core-title-present": "pass", "technical-https": "fail" },
    );
    expect(diff.fixedRules).toContain("core-title-present");
    expect(diff.regressedRules).toContain("technical-https");
  });
});
