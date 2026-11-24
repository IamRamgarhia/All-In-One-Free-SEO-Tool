import { describe, expect, it } from "vitest";
import { PLATFORM_TACTICS, priorityForNiche } from "./ai-citation-tactics";
import { PLATFORM_TACTICS_FR, PRIORITY_REASONS_FR } from "./ai-citation-tactics.fr";

describe("French citation tactics", () => {
  it("covers every platform and every tactic", () => {
    expect(Object.keys(PLATFORM_TACTICS_FR).sort()).toEqual(PLATFORM_TACTICS.map((p) => p.platform).sort());
    for (const p of PLATFORM_TACTICS) {
      expect(Object.keys(PLATFORM_TACTICS_FR[p.platform].tactics).sort(), p.platform).toEqual(
        p.tactics.map((t) => t.id).sort(),
      );
    }
  });

  it("gives a reason for every priority of every niche", () => {
    for (const niche of ["saas", "local", "ecommerce", "blog", "services", null]) {
      const fr = PRIORITY_REASONS_FR[niche ?? "universal"];
      for (const p of priorityForNiche(niche)) expect(fr?.[p.platform], `${niche} ${p.platform}`).toBeTruthy();
    }
  });
});
