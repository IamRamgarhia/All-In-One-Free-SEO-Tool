import { describe, expect, it, vi } from "vitest";

// The module imports the task queue (and so the database); only the pure
// helpers are tested here.
vi.mock("@/lib/task-chat/queue", () => ({ startQueue: vi.fn() }));
vi.mock("@/db/client", () => ({ db: {} }));

import { levelFor, pickEngine } from "./claude-autopilot";

const site = { wpEndpoint: "https://x.test/wp-json/stb", wpKey: "k" };
const folder = { localPath: "C:\\sites\\x" };

describe("pickEngine", () => {
  it("uses WordPress when the site is connected", () => {
    expect(pickEngine({ autopilotEngine: "auto", wpEndpoint: site.wpEndpoint, wpKey: site.wpKey, localPath: null })).toBe("wordpress");
  });

  it("uses Claude when only a folder is set", () => {
    expect(pickEngine({ autopilotEngine: "auto", wpEndpoint: null, wpKey: null, localPath: folder.localPath })).toBe("claude");
  });

  it("prefers WordPress when both exist, unless told otherwise", () => {
    const both = { ...site, ...folder };
    expect(pickEngine({ autopilotEngine: "auto", ...both })).toBe("wordpress");
    expect(pickEngine({ autopilotEngine: "claude", ...both })).toBe("claude");
  });

  it("is none when the chosen engine has nothing to work with", () => {
    expect(pickEngine({ autopilotEngine: "claude", wpEndpoint: null, wpKey: null, localPath: null })).toBe("none");
    expect(pickEngine({ autopilotEngine: "wordpress", wpEndpoint: null, wpKey: null, localPath: folder.localPath })).toBe("none");
    expect(pickEngine({ autopilotEngine: "auto", wpEndpoint: null, wpKey: null, localPath: null })).toBe("none");
  });
});

describe("levelFor", () => {
  it("follows the workspace unless the client has its own", () => {
    expect(levelFor({ autopilotLevel: null }, "suggest")).toBe("suggest");
    expect(levelFor({ autopilotLevel: "apply_safe" }, "off")).toBe("apply_safe");
    expect(levelFor({ autopilotLevel: "off" }, "apply_all")).toBe("off");
  });
});
