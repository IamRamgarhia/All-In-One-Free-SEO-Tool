import { describe, expect, it } from "vitest";
import { diffRuleStatuses, scoreDelta } from "./diff";

describe("diffRuleStatuses", () => {
  it("detects fixed, regressed, new and worsened", () => {
    const diff = diffRuleStatuses(
      {
        "core-title-present": "fail",
        "core-h1-present": "pass",
        "security-https": "warn",
      },
      {
        "core-title-present": "pass",
        "core-h1-present": "fail",
        "security-https": "fail",
        "links-broken-internal": "fail",
      },
    );

    expect(diff.fixedRules).toContain("core-title-present");
    expect(diff.regressedRules).toContain("core-h1-present");
    expect(diff.worsenedRules).toContain("security-https");
    expect(diff.newIssues).toContain("links-broken-internal");
  });
});

describe("scoreDelta", () => {
  it("subtracts previous from current", () => {
    expect(scoreDelta(70, 82)).toBe(12);
    expect(scoreDelta(null, 82)).toBeNull();
  });
});
