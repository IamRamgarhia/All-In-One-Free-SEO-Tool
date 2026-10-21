import { describe, expect, it } from "vitest";
import { ensureNativeRulesRegistered } from "./register-native";
import { getRulesByCategory, getRuleCount } from "@/audit/engine/rule-registry";

describe("native rule registry (Wave 1+2)", () => {
  it("registers core, technical, crawlability, links, redirect, url", () => {
    const n = ensureNativeRulesRegistered();
    expect(n).toBeGreaterThanOrEqual(70);
    expect(getRulesByCategory("core").length).toBeGreaterThanOrEqual(20);
    expect(getRulesByCategory("technical").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("crawlability").length).toBeGreaterThanOrEqual(12);
    expect(getRulesByCategory("links").length).toBeGreaterThanOrEqual(15);
    expect(getRulesByCategory("redirect").length).toBeGreaterThanOrEqual(7);
    expect(getRulesByCategory("url").length).toBeGreaterThanOrEqual(10);
    expect(getRuleCount()).toBe(n);
  });
});
