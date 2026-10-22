import { describe, expect, it } from "vitest";
import { ensureNativeRulesRegistered } from "./register-native";
import { getRulesByCategory, getRuleCount } from "@/audit/engine/rule-registry";
import { ACTIVE_AUDIT_CATEGORIES } from "@/audit/engine/categories";

describe("native rule registry (Waves 1–5)", () => {
  it("registers all active categories", () => {
    const n = ensureNativeRulesRegistered();
    expect(n).toBeGreaterThanOrEqual(160);
    expect(getRulesByCategory("core").length).toBeGreaterThanOrEqual(20);
    expect(getRulesByCategory("technical").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("crawlability").length).toBeGreaterThanOrEqual(12);
    expect(getRulesByCategory("links").length).toBeGreaterThanOrEqual(15);
    expect(getRulesByCategory("redirect").length).toBeGreaterThanOrEqual(7);
    expect(getRulesByCategory("url").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("js").length).toBeGreaterThanOrEqual(8);
    expect(getRulesByCategory("perf").length).toBeGreaterThanOrEqual(8);
    expect(getRulesByCategory("images").length).toBeGreaterThanOrEqual(6);
    expect(getRulesByCategory("content").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("schema").length).toBeGreaterThanOrEqual(6);
    expect(getRulesByCategory("security").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("html").length).toBeGreaterThanOrEqual(8);
    expect(getRulesByCategory("a11y").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("mobile").length).toBeGreaterThanOrEqual(5);
    expect(getRulesByCategory("i18n").length).toBeGreaterThanOrEqual(5);
    expect(getRulesByCategory("eeat").length).toBeGreaterThanOrEqual(6);
    expect(getRulesByCategory("social").length).toBeGreaterThanOrEqual(6);
    expect(getRulesByCategory("geo").length).toBeGreaterThanOrEqual(5);
    expect(getRulesByCategory("legal").length).toBeGreaterThanOrEqual(2);
    expect(getRuleCount()).toBe(n);

    for (const cat of ACTIVE_AUDIT_CATEGORIES) {
      expect(getRulesByCategory(cat).length).toBeGreaterThan(0);
    }
  });
});
