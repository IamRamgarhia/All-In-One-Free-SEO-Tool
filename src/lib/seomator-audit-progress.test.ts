import { describe, expect, it } from "vitest";
import {
  initialSeomatorProgress,
  progressOnCategoryComplete,
  progressOnCategoryStart,
} from "./seomator-audit-progress";

describe("seomator-audit-progress", () => {
  it("orders categories and marks running/complete", () => {
    let p = initialSeomatorProgress(["geo", "core", "perf"]);
    expect(p.categories.map((c) => c.id)).toEqual(["core", "perf", "geo"]);

    p = progressOnCategoryStart(p, "core", "Core SEO");
    expect(p.currentCategoryId).toBe("core");
    expect(p.categories.find((c) => c.id === "core")?.status).toBe("running");

    p = progressOnCategoryComplete(p, "core", {
      categoryId: "core",
      score: 88,
      passCount: 10,
      warnCount: 1,
      failCount: 0,
      results: [],
    });
    expect(p.categories.find((c) => c.id === "core")?.score).toBe(88);
    expect(p.categories.find((c) => c.id === "core")?.status).toBe("complete");
  });
});
