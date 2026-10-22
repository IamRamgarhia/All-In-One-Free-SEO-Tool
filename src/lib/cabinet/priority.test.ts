import { describe, expect, it } from "vitest";
import { effortForPriority, priorityForIssue } from "./priority";

describe("priorityForIssue", () => {
  it("maps indexing blockers to P0", () => {
    expect(
      priorityForIssue({
        ruleId: "core-robots-meta-noindex",
        category: "core",
        severity: "critical",
        status: "fail",
      }),
    ).toBe("P0");
  });

  it("maps title issues to P1", () => {
    expect(
      priorityForIssue({
        ruleId: "core-title-present",
        category: "core",
        severity: "high",
        status: "fail",
      }),
    ).toBe("P1");
  });

  it("maps social to P3", () => {
    expect(
      priorityForIssue({
        ruleId: "social-og-title",
        category: "social",
        severity: "low",
        status: "warn",
      }),
    ).toBe("P3");
  });

  it("keeps social fails at P3 (not escalated by high severity)", () => {
    expect(
      priorityForIssue({
        ruleId: "social-og-title",
        category: "social",
        severity: "high",
        status: "fail",
      }),
    ).toBe("P3");
  });
});

describe("effortForPriority", () => {
  it("is exhaustive", () => {
    expect(effortForPriority("P0")).toBe("M");
    expect(effortForPriority("P3")).toBe("S");
  });
});
