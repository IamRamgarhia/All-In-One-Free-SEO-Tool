import { describe, expect, it } from "vitest";
import { canCreateMission, isRecurring, projectStage, suggestMission, type AuditFacts } from "./missions";

const facts = (over: Partial<AuditFacts> = {}): AuditFacts => ({
  fullAuditDone: true,
  quickAuditDone: true,
  score: 92,
  critical: 0,
  high: 0,
  pagesCrawled: 40,
  ...over,
});

describe("projectStage", () => {
  it("starts at to_audit; the quick audit run when the project is added is enough", () => {
    expect(projectStage({ fullAuditDone: false, quickAuditDone: false })).toBe("to_audit");
    expect(projectStage({ fullAuditDone: false, quickAuditDone: true })).toBe("audited");
    expect(projectStage({ fullAuditDone: true, quickAuditDone: false })).toBe("audited");
  });
});

describe("canCreateMission", () => {
  it("needs an audit, quick or full", () => {
    expect(canCreateMission({ fullAuditDone: false, quickAuditDone: false })).toBe(false);
    expect(canCreateMission({ fullAuditDone: false, quickAuditDone: true })).toBe(true);
    expect(canCreateMission({ fullAuditDone: true, quickAuditDone: false })).toBe(true);
  });
});

describe("suggestMission", () => {
  it("suggests nothing before any audit", () => {
    expect(suggestMission(facts({ fullAuditDone: false, quickAuditDone: false }))).toBeNull();
    expect(suggestMission(facts({ score: null }))).toBeNull();
  });

  it("suggests from the quick audit alone", () => {
    expect(suggestMission(facts({ fullAuditDone: false, quickAuditDone: true }))).toEqual({
      kind: "monitoring",
      reason: "healthy",
    });
  });

  it("a healthy site gets monthly monitoring", () => {
    expect(suggestMission(facts())).toEqual({ kind: "monitoring", reason: "healthy" });
  });

  it("a critical finding moves a good score to the whole circuit", () => {
    expect(suggestMission(facts({ score: 92, critical: 3 }))?.kind).toBe("full");
    expect(suggestMission(facts({ score: 65 }))?.kind).toBe("full");
  });

  it("a weak site gets a redesign, then monitoring; an unreachable one gets no suggestion", () => {
    expect(suggestMission(facts({ score: 35 }))).toEqual({
      kind: "redesign",
      reason: "weak_site",
      then: "monitoring",
    });
    expect(suggestMission(facts({ score: 0, pagesCrawled: 0 }))).toBeNull();
  });

  it("the thresholds are the report's: 50 and 80", () => {
    expect(suggestMission(facts({ score: 49 }))?.kind).toBe("redesign");
    expect(suggestMission(facts({ score: 50 }))?.kind).toBe("full");
    expect(suggestMission(facts({ score: 79 }))?.kind).toBe("full");
    expect(suggestMission(facts({ score: 80 }))?.kind).toBe("monitoring");
  });
});

describe("isRecurring", () => {
  it("monitoring and the whole circuit run on; the rest end", () => {
    expect(isRecurring("monitoring")).toBe(true);
    expect(isRecurring("full")).toBe(true);
    expect(isRecurring("audit")).toBe(false);
    expect(isRecurring("redesign")).toBe(false);
  });
});
