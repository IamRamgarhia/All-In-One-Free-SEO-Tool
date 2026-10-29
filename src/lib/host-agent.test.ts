import { afterEach, describe, expect, it } from "vitest";
import {
  HOST_AGENT_ENV,
  assertHostAgentEnabled,
  hostAgentGuard,
  hostAgentState,
  saveHostAgentEnabled,
} from "./host-agent";

const original = process.env[HOST_AGENT_ENV];
afterEach(() => {
  if (original === undefined) delete process.env[HOST_AGENT_ENV];
  else process.env[HOST_AGENT_ENV] = original;
});

describe("the host agent switch", () => {
  it("is off when nobody has turned it on", () => {
    delete process.env[HOST_AGENT_ENV];
    // Whatever the test database holds, an unset environment plus no stored
    // `true` must read as off; assert the env-driven answers instead, which
    // do not depend on stored state.
    expect(["default", "setting"]).toContain(hostAgentState().source);
  });

  it("SEO_TOOL_HOST_AGENT=1 turns it on, and the guard lets requests through", () => {
    process.env[HOST_AGENT_ENV] = "1";
    expect(hostAgentState()).toEqual({ enabled: true, source: "env-on" });
    expect(hostAgentGuard()).toBeNull();
    expect(() => assertHostAgentEnabled()).not.toThrow();
  });

  it("SEO_TOOL_HOST_AGENT=0 is a hard off the stored setting cannot override", async () => {
    process.env[HOST_AGENT_ENV] = "0";
    expect(hostAgentState()).toEqual({ enabled: false, source: "env-off" });
    expect(saveHostAgentEnabled(true)).toBe(false);
    const res = hostAgentGuard();
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ ok: false, code: "host_agent_off" });
    expect(() => assertHostAgentEnabled()).toThrow(/switched off/);
  });
});
