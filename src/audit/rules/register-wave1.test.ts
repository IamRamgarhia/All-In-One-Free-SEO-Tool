import { describe, expect, it } from "vitest";
import { ensureWave1RulesRegistered } from "./register-wave1";
import { getRulesByCategory, getRuleCount } from "@/audit/engine/rule-registry";

describe("Wave 1 registry", () => {
  it("registers core, technical and crawlability rules", () => {
    const n = ensureWave1RulesRegistered();
    expect(n).toBeGreaterThanOrEqual(40);
    expect(getRulesByCategory("core").length).toBeGreaterThanOrEqual(20);
    expect(getRulesByCategory("technical").length).toBeGreaterThanOrEqual(10);
    expect(getRulesByCategory("crawlability").length).toBeGreaterThanOrEqual(6);
    expect(getRuleCount()).toBe(n);
  });
});
