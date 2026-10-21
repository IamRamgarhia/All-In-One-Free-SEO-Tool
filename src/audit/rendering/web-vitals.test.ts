import { describe, expect, it } from "vitest";
import { verdictFor } from "./web-vitals";

describe("verdictFor", () => {
  it("classifies LCP thresholds", () => {
    expect(verdictFor("lcp", undefined)).toBe("unmeasured");
    expect(verdictFor("lcp", 2000)).toBe("good");
    expect(verdictFor("lcp", 3000)).toBe("needs-improvement");
    expect(verdictFor("lcp", 5000)).toBe("poor");
  });

  it("classifies CLS thresholds", () => {
    expect(verdictFor("cls", 0.05)).toBe("good");
    expect(verdictFor("cls", 0.15)).toBe("needs-improvement");
    expect(verdictFor("cls", 0.4)).toBe("poor");
  });
});
