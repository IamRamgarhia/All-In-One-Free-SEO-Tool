import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-internal-path";

describe("safeInternalPath", () => {
  it("defaults to home", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
  });

  it("keeps valid internal paths", () => {
    expect(safeInternalPath("/audits/12")).toBe("/audits/12");
    expect(safeInternalPath("/clients/3?tab=tasks")).toBe("/clients/3?tab=tasks");
  });

  it("rejects open redirects", () => {
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("https://evil.com")).toBe("/");
  });

  it("rejects path traversal", () => {
    expect(safeInternalPath("/clients/../etc")).toBe("/");
  });
});
