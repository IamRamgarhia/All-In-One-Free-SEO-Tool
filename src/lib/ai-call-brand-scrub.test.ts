/**
 * Is the brand guard actually on the path model output takes out?
 *
 * example-brand-guard.test.ts proves the stripping is correct. It says
 * nothing about whether anything calls it — and a guard nobody calls
 * passes its own tests forever while the leak it was written for keeps
 * happening. That is the failure this file exists to catch.
 *
 * The provider is mocked, so this costs nothing and does not depend on a
 * key being configured. Everything between the provider and the caller
 * is the real code.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";

const LEAKY_REPLY = "Home - Dice Codes";

vi.mock("./provider-dispatch", () => ({
  // Whatever was asked, answer with the example brand in it — which is
  // what a model handed the worked example in seo-agent.ts sometimes
  // does for a client it was never told the brand of.
  dispatchProviderCall: vi.fn(
    async (_provider: string, args: { onModelUsed?: (m: string) => void }) => {
      args.onModelUsed?.("mock-model");
      return LEAKY_REPLY;
    },
  ),
  defaultModelFor: () => "mock-model",
}));

vi.mock("./api-keys", () => ({
  getActiveProvider: async () => "gemini",
  getApiKey: async () => "test-key-not-a-real-one",
  getOllamaUrl: async () => null,
}));

vi.mock("./ai-usage", () => ({
  checkMonthlyCap: async () => ({ exceeded: false, capUsd: null }),
  logAiCall: async () => {},
}));

let otherClientId = 0;
let ownClientId = 0;

beforeEach(async () => {
  const [other] = await db
    .insert(clients)
    .values({ name: "Prateek Tapes", url: "https://prateektapes.com" })
    .returning({ id: clients.id });
  otherClientId = other.id;
  const [own] = await db
    .insert(clients)
    .values({ name: "Dice Codes", url: "https://dicecodes.com/" })
    .returning({ id: clients.id });
  ownClientId = own.id;
});

afterEach(async () => {
  await db.delete(clients).where(eq(clients.id, otherClientId));
  await db.delete(clients).where(eq(clients.id, ownClientId));
  vi.restoreAllMocks();
});

describe("callAIResult strips the example brand", () => {
  it("removes it from another client's suggestion", async () => {
    const { callAIResult } = await import("./ai-call");
    const res = await callAIResult({
      system: "You write page titles.",
      user: "Suggest a homepage title",
      clientId: otherClientId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).not.toMatch(/dice\s*codes/i);
    expect(res.text).toBe("Home");
  });

  it("leaves it alone for the client who owns the brand", async () => {
    const { callAIResult } = await import("./ai-call");
    const res = await callAIResult({
      system: "You write page titles.",
      user: "Suggest a homepage title",
      clientId: ownClientId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toBe(LEAKY_REPLY);
  });

  it("strips it when there is no client to check against", async () => {
    // A tool with no client selected cannot be the brand's owner, and
    // guessing "probably fine" is how the leak reaches a page.
    const { callAIResult } = await import("./ai-call");
    const res = await callAIResult({
      system: "You write page titles.",
      user: "Suggest a homepage title",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).not.toMatch(/dice\s*codes/i);
  });

  it("leaves it alone when the user's own prompt names it", async () => {
    // Found live, not here. meta-tag-generator has a `brand` field; with
    // "Dice Codes" typed into it the first version of the guard deleted
    // the brand from all five titles it had just been asked to write.
    // Echoing back what somebody typed is the correct answer, so the
    // prompt gets the final say over the client record.
    const { callAIResult } = await import("./ai-call");
    const res = await callAIResult({
      system: "You write page titles.",
      user: "Write a homepage title for the brand Dice Codes",
      clientId: otherClientId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toBe(LEAKY_REPLY);
  });

  it("checks the system prompt too, not just the user turn", async () => {
    const { callAIResult } = await import("./ai-call");
    const res = await callAIResult({
      system: "You write page titles for Dice Codes.",
      user: "Suggest a homepage title",
      clientId: otherClientId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toBe(LEAKY_REPLY);
  });

  it("still reports which model answered", async () => {
    // The scrub rewrites `text`; it must not drop the rest of the result.
    const { callAIResult } = await import("./ai-call");
    const res = await callAIResult({
      system: "You write page titles.",
      user: "Suggest a homepage title",
      clientId: otherClientId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model).toBe("mock-model");
  });
});
