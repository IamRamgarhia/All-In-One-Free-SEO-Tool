import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ db: {} }));

import { chatModelArgs, normalizeChatModel } from "./model";

describe("chat model settings", () => {
  it("passes nothing for the defaults", () => {
    expect(chatModelArgs({ model: "default", effort: "default" })).toEqual([]);
  });

  it("passes the chosen model and effort to claude", () => {
    expect(chatModelArgs({ model: "opus", effort: "high" })).toEqual(["--model", "opus", "--effort", "high"]);
    expect(chatModelArgs({ model: "default", effort: "max" })).toEqual(["--effort", "max"]);
  });

  it("falls back to the default for anything unknown", () => {
    expect(normalizeChatModel({ model: "gpt-9", effort: 3 })).toEqual({ model: "default", effort: "default" });
    expect(normalizeChatModel({ model: "sonnet", effort: "low" })).toEqual({ model: "sonnet", effort: "low" });
  });
});
