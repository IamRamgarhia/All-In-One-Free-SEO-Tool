import { describe, expect, it } from "vitest";
import {
  clamp01,
  composite,
  ramp,
  type Signal,
  DETERMINISTIC,
  HEURISTIC,
} from "@/lib/geo-audit/scoring/model";

describe("geo composite parity", () => {
  it("clamps ramp at both ends", () => {
    expect(ramp(0, 0.3, 0.8)).toBe(0);
    expect(ramp(0.3, 0.3, 0.8)).toBe(0);
    expect(ramp(0.8, 0.3, 0.8)).toBe(1);
    expect(ramp(1, 0.3, 0.8)).toBe(1);
    expect(ramp(0.55, 0.3, 0.8)).toBeCloseTo(0.5);
  });

  it("null signal leaves both sides of the fraction", () => {
    const base: Signal[] = [
      { id: "a", cls: DETERMINISTIC, max: 25, value: 20, detail: {} },
      { id: "b", cls: DETERMINISTIC, max: 20, value: 15, detail: {} },
      { id: "c", cls: DETERMINISTIC, max: 15, value: 10, detail: {} },
      { id: "d", cls: DETERMINISTIC, max: 10, value: 8, detail: {} },
      { id: "e", cls: DETERMINISTIC, max: 10, value: 5, detail: {} },
      { id: "f", cls: DETERMINISTIC, max: 10, value: 7, detail: {} },
      {
        id: "g",
        cls: HEURISTIC,
        max: 10,
        value: null,
        detail: { reason: "browser extra not installed" },
        skippedReason: "browser extra not installed",
      },
    ];
    const [without] = composite(base);
    const withBrowser = base.map((s) =>
      s.id === "g" ? { ...s, value: 10, skippedReason: null } : s,
    );
    const [perfect] = composite(withBrowser);
    const zeroRender = base.map((s) =>
      s.id === "g" ? { ...s, value: 0, skippedReason: null } : s,
    );
    const [zeroed] = composite(zeroRender);
    expect(without).toBeGreaterThan(zeroed);
    expect(perfect).toBeGreaterThanOrEqual(without);
  });

  it("completeness names missing signals", () => {
    const signals: Signal[] = [
      { id: "citability.self_containment", cls: DETERMINISTIC, max: 25, value: 20, detail: {} },
      { id: "citability.render_parity", cls: HEURISTIC, max: 10, value: null, detail: {}, skippedReason: "x" },
    ];
    const [, completeness] = composite(signals);
    expect(completeness.computed).toBe(1);
    expect(completeness.total).toBe(2);
    expect(completeness.missing).toEqual(["citability.render_parity"]);
  });

  it("clamp01 bounds", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});
