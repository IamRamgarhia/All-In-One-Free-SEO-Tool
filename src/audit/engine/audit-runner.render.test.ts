import { describe, expect, it } from "vitest";
import { defaultAuditConfig } from "./audit-runner";

describe("defaultAuditConfig Wave 3", () => {
  it("keeps Playwright off unless explicitly enabled", () => {
    const quick = defaultAuditConfig({ mode: "quick" });
    expect(quick.render).toBe(false);
    expect(quick.measureCwv).toBe(false);
    expect(quick.maxPages).toBe(1);

    const fullNoRender = defaultAuditConfig({ mode: "full" });
    expect(fullNoRender.render).toBe(false);
    expect(fullNoRender.maxPages).toBe(25);

    const fullWithRender = defaultAuditConfig({
      mode: "full",
      render: true,
      measureCwv: true,
    });
    expect(fullWithRender.render).toBe(true);
    expect(fullWithRender.measureCwv).toBe(true);
  });
});
