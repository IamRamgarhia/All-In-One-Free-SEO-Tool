/**
 * A page render must never wait on a model.
 *
 * The dashboard called one inline on every load. Measured on a warm
 * production build with four clients: the shell arrived in 33ms, the
 * data panels took 4ms and 279ms, and the model took 1,448ms. So a
 * decorative one-line summary was most of the time the home page took,
 * on every single visit, and it was paid for every time.
 *
 * After this: 240ms warm. The tests below are the ones that would catch
 * it coming back — the failure is invisible in a code review, because
 * awaiting the model reads exactly like awaiting anything else.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { workspaceSettings } from "@/db/schema";

const callAI = vi.fn();
vi.mock("./ai-call", () => ({ callAI: (...a: unknown[]) => callAI(...a) }));

const { cachedNarrative } = await import("./cached-narrative");

const REQ = {
  id: "test_panel",
  facts: "Tasks completed: 4\nLinks built: 2",
  system: "Summarise.",
  user: "Summarise these numbers.",
};

/** Let the detached background generation finish. */
const settle = () => new Promise((r) => setTimeout(r, 30));

beforeEach(async () => {
  callAI.mockReset();
  callAI.mockResolvedValue("Four tasks done and two links built.");
  await db.delete(workspaceSettings).where(like(workspaceSettings.key, "narrative.%"));
});

afterEach(async () => {
  await db.delete(workspaceSettings).where(like(workspaceSettings.key, "narrative.%"));
});

describe("the first call never waits", () => {
  it("returns null immediately rather than the model's answer", async () => {
    const started = Date.now();
    const out = await cachedNarrative(REQ);
    const took = Date.now() - started;

    expect(out).toBeNull();
    // The whole point. If this ever returns the text, somebody has made
    // the render await the model again.
    expect(took, "the first call waited for the model").toBeLessThan(150);
    await settle();
  });

  it("generates in the background so the next call has it", async () => {
    expect(await cachedNarrative(REQ)).toBeNull();
    await settle();
    expect(await cachedNarrative(REQ)).toBe("Four tasks done and two links built.");
  });

  it("serves the cached answer without calling the model again", async () => {
    await cachedNarrative(REQ);
    await settle();
    callAI.mockClear();
    expect(await cachedNarrative(REQ)).toBe("Four tasks done and two links built.");
    expect(callAI).not.toHaveBeenCalled();
  });
});

describe("a narrative is only valid for the numbers it describes", () => {
  it("does not serve an old summary next to new numbers", async () => {
    // The failure this prevents is worse than a missing sentence: a
    // paragraph confidently stating figures that are not on the screen
    // beside it.
    await cachedNarrative(REQ);
    await settle();
    expect(await cachedNarrative(REQ)).not.toBeNull();

    const moved = { ...REQ, facts: "Tasks completed: 9\nLinks built: 2" };
    expect(await cachedNarrative(moved)).toBeNull();
  });

  it("expires a stale one even when the numbers match", async () => {
    await cachedNarrative(REQ);
    await settle();

    // Age it past the six-hour window.
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.key, "narrative.test_panel"));
    await db
      .update(workspaceSettings)
      .set({ value: { ...(row.value as object), at: old } })
      .where(eq(workspaceSettings.key, "narrative.test_panel"));

    expect(await cachedNarrative(REQ)).toBeNull();
    await settle();
  });
});

describe("when the model cannot answer", () => {
  it("returns null and stores nothing rather than caching a failure", async () => {
    // A cached empty string would mean the panel never tries again.
    callAI.mockResolvedValue(null);
    expect(await cachedNarrative(REQ)).toBeNull();
    await settle();
    const rows = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.key, "narrative.test_panel"));
    expect(rows).toEqual([]);
  });

  it("survives the model throwing", async () => {
    callAI.mockRejectedValue(new Error("quota exhausted"));
    await expect(cachedNarrative(REQ)).resolves.toBeNull();
    await settle();
  });
});

describe("one generation at a time", () => {
  it("does not start six for six simultaneous renders", async () => {
    // Six Suspense boundaries resolving together used to mean six
    // identical requests, six times the cost, for one sentence.
    let resolve: (v: string) => void = () => {};
    callAI.mockImplementation(() => new Promise<string>((r) => (resolve = r)));

    await Promise.all(Array.from({ length: 6 }, () => cachedNarrative(REQ)));
    // Generation is detached on purpose — that is the whole feature — so
    // it has not necessarily reached the model by the time the six calls
    // have returned. Waiting a tick asserts the guard, not the timing.
    await settle();
    expect(callAI).toHaveBeenCalledTimes(1);

    resolve("Done.");
    await settle();
  });
});
