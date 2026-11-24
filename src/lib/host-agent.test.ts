import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import {
  CodeAgentOffError,
  HOST_AGENT_ENV,
  assertCodeAgentEnabled,
  codeAgentState,
  codeAgentStateFor,
  findOnPath,
  hostAgentForcedOff,
} from "./host-agent";

const original = process.env[HOST_AGENT_ENV];
afterEach(() => {
  if (original === undefined) delete process.env[HOST_AGENT_ENV];
  else process.env[HOST_AGENT_ENV] = original;
});

function newClient(): number {
  const [row] = db
    .insert(clients)
    .values({ name: "Test", url: "https://example.test" })
    .returning({ id: clients.id })
    .all();
  return row.id;
}

describe("Claude Code on the host, per client", () => {
  it("is off for a new client until somebody switches it on", () => {
    delete process.env[HOST_AGENT_ENV];
    const id = newClient();
    expect(codeAgentState(id)).toEqual({ enabled: false, reason: "client_off" });
    expect(() => assertCodeAgentEnabled(id)).toThrow(CodeAgentOffError);
  });

  it("is on once the client's switch is on", () => {
    delete process.env[HOST_AGENT_ENV];
    const id = newClient();
    db.update(clients).set({ codeAgentEnabled: true }).where(eq(clients.id, id)).run();
    expect(codeAgentState(id)).toEqual({ enabled: true });
    expect(() => assertCodeAgentEnabled(id)).not.toThrow();
  });

  it("SEO_TOOL_HOST_AGENT=0 is a hard off a client's switch cannot override", () => {
    process.env[HOST_AGENT_ENV] = "0";
    expect(hostAgentForcedOff()).toBe(true);
    expect(codeAgentStateFor({ codeAgentEnabled: true })).toEqual({ enabled: false, reason: "env_off" });
  });

  it("SEO_TOOL_HOST_AGENT=1 does not switch every client on", () => {
    process.env[HOST_AGENT_ENV] = "1";
    expect(codeAgentStateFor({ codeAgentEnabled: false })).toEqual({ enabled: false, reason: "client_off" });
  });

  it("an unknown client is never on", () => {
    delete process.env[HOST_AGENT_ENV];
    expect(codeAgentStateFor(null).enabled).toBe(false);
    expect(codeAgentState(987654).enabled).toBe(false);
  });

  it("looks a program up in PATH without running it", () => {
    expect(findOnPath("certainly-not-a-real-program-xyz")).toBeNull();
    expect(findOnPath("node")).not.toBeNull();
  });
});
