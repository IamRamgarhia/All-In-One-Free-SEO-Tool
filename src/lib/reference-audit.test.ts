import { describe, expect, it } from "vitest";
import { pickReferenceAudits } from "./reference-audit";

const a = (id: number, kind: string, mode: string | null) => ({ id, kind, mode });

describe("pickReferenceAudits", () => {
  it("never takes the AI audit, even when it finished last", () => {
    const r = pickReferenceAudits([a(3, "ai_full", null), a(2, "crawler", "quick")]);
    expect(r.latest?.id).toBe(2);
    expect(r.crawls.map((x) => x.id)).toEqual([2]);
  });

  it("prefers the latest full crawl over a newer quick one", () => {
    const r = pickReferenceAudits([a(4, "crawler", "quick"), a(3, "crawler", "full"), a(2, "crawler", "quick")]);
    expect(r.latest?.id).toBe(3);
  });

  it("compares with the previous crawl of the same mode only", () => {
    const r = pickReferenceAudits([
      a(5, "crawler", "full"),
      a(4, "crawler", "quick"),
      a(3, "ai_full", null),
      a(2, "crawler", "full"),
    ]);
    expect(r.latest?.id).toBe(5);
    expect(r.previous?.id).toBe(2);
  });

  it("a first full crawl after quick ones has nothing to compare with", () => {
    const r = pickReferenceAudits([a(3, "crawler", "full"), a(2, "crawler", "quick")]);
    expect(r.latest?.id).toBe(3);
    expect(r.previous).toBeNull();
  });

  it("treats rows without a mode as full crawls", () => {
    const r = pickReferenceAudits([a(2, "crawler", "quick"), a(1, "crawler", null)]);
    expect(r.latest?.id).toBe(1);
  });

  it("returns nothing when there is no crawl", () => {
    expect(pickReferenceAudits([a(1, "ai_full", null)])).toEqual({ latest: null, previous: null, crawls: [] });
  });
});
