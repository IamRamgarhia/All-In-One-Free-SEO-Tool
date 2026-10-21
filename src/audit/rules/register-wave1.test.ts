import { describe, expect, it } from "vitest";
import { ensureNativeRulesRegistered } from "./register-native";
import { getRulesByCategory, getRuleCount } from "@/audit/engine/rule-registry";

describe("native rule registry (Wave 1–3)", () => {
  it("registers Wave 1–3 categories", () => {
    const n = ensureNativeRulesRegistered();
    expect(n).toBeGreaterThanOrEqual(100);
    expect(getRulesByCategory("core").length).toBeGreaterThanOrEqual(20);
    expect(getRulesByCategory("technical").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("crawlability").length).toBeGreaterThanOrEqual(12);
    expect(getRulesByCategory("links").length).toBeGreaterThanOrEqual(15);
    expect(getRulesByCategory("redirect").length).toBeGreaterThanOrEqual(7);
    expect(getRulesByCategory("url").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("js").length).toBeGreaterThanOrEqual(8);
    expect(getRulesByCategory("perf").length).toBeGreaterThanOrEqual(8);
    expect(getRulesByCategory("images").length).toBeGreaterThanOrEqual(6);
    expect(getRuleCount()).toBe(n);
  });
});
