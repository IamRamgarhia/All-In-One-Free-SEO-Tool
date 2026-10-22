import { describe, expect, it } from "vitest";
import { getRuleCount, getAllRules, getCategoryIds } from "@seomator/seo-audit";

/**
 * Guards against shipping a half-port marketed as complete.
 * The live technical engine must expose SEOmator's full rule set.
 */
describe("SEOmator rule parity", () => {
  it("registers ~373 rules across 20 categories", () => {
    const count = getRuleCount();
    expect(count).toBeGreaterThanOrEqual(370);
    expect(count).toBeLessThanOrEqual(400);

    const categories = getCategoryIds();
    expect(categories.length).toBe(20);

    const byCat = new Map<string, number>();
    for (const rule of getAllRules()) {
      byCat.set(rule.category, (byCat.get(rule.category) ?? 0) + 1);
    }
    // Every active category must contribute at least one rule.
    for (const id of categories) {
      expect(byCat.get(id) ?? 0).toBeGreaterThan(0);
    }
  });

  it("includes redirect-type that needs status-bearing redirect chains", () => {
    const rule = getAllRules().find((r) => r.id === "redirect-type");
    expect(rule).toBeDefined();
    expect(rule?.category).toBe("redirect");
  });
});
