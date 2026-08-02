import { describe, expect, it } from "vitest";
import { hasPluginVersion } from "./capabilities";

/**
 * Gates capabilities on the version of the WordPress plugin installed on
 * the client's site — which the user controls and may never update.
 *
 * The asymmetry matters and drives every case below. Claiming a
 * capability the plugin doesn't have produces a failed write on
 * someone's live website. Claiming one it does have produces a message
 * telling them to update, which is merely annoying. So every ambiguous
 * input must resolve to "too old".
 */

describe("hasPluginVersion", () => {
  it("accepts the exact required version", () => {
    expect(hasPluginVersion("0.3.0", "0.3.0")).toBe(true);
  });

  it("accepts newer", () => {
    expect(hasPluginVersion("0.3.1", "0.3.0")).toBe(true);
    expect(hasPluginVersion("0.4.0", "0.3.0")).toBe(true);
    expect(hasPluginVersion("1.0.0", "0.3.0")).toBe(true);
  });

  it("rejects older", () => {
    expect(hasPluginVersion("0.2.1", "0.3.0")).toBe(false);
    expect(hasPluginVersion("0.2.9", "0.3.0")).toBe(false);
  });

  it("compares numerically, not as strings", () => {
    // "0.10.0" < "0.3.0" as a string, and that would report a NEWER
    // plugin as too old — the annoying direction, but wrong.
    expect(hasPluginVersion("0.10.0", "0.3.0")).toBe(true);
    expect(hasPluginVersion("0.3.0", "0.10.0")).toBe(false);
  });

  it("treats a missing version as too old", () => {
    // A plugin that doesn't report its version is one we know nothing
    // about. Guessing optimistically means a failed write on a live site.
    expect(hasPluginVersion(null, "0.3.0")).toBe(false);
    expect(hasPluginVersion(undefined, "0.3.0")).toBe(false);
    expect(hasPluginVersion("", "0.3.0")).toBe(false);
  });

  it("treats an unparseable version as too old", () => {
    expect(hasPluginVersion("beta", "0.3.0")).toBe(false);
    expect(hasPluginVersion("v0.3.0", "0.3.0")).toBe(false);
    expect(hasPluginVersion("0.x.0", "0.3.0")).toBe(false);
  });

  it("handles differing part counts", () => {
    // "0.3" means 0.3.0, and must satisfy a 0.3.0 requirement.
    expect(hasPluginVersion("0.3", "0.3.0")).toBe(true);
    expect(hasPluginVersion("0.3.0.1", "0.3.0")).toBe(true);
    expect(hasPluginVersion("0.2", "0.3.0")).toBe(false);
  });

  it("tolerates surrounding whitespace", () => {
    expect(hasPluginVersion(" 0.3.0 ", "0.3.0")).toBe(true);
  });
});
