/**
 * A one-line AI narrative that never makes anybody wait for it.
 *
 * The dashboard called a model on every render. Measured on a warm
 * production build with four clients: the page shell arrived in 33ms,
 * the data panels took 4ms and 430ms, and the model took **1,448ms**.
 * That is where the second and a half went, on every load, every
 * refresh, every navigation back to the home page.
 *
 * It also spent money each time. An install with a monthly AI cap could
 * exhaust it by leaving the dashboard open on a monitor.
 *
 * THE RULE THIS ENCODES
 *
 * A page render never waits on a model. The numbers are the page; the
 * sentence about them is a decoration, and a decoration that costs a
 * second and a half is not worth the wait even once.
 *
 * So: return what is cached, instantly. If nothing is cached for these
 * exact numbers, return null and generate in the background, so the next
 * visit has it. The narrative appears a moment late rather than the page
 * appearing a second and a half late.
 */

import { createHash } from "node:crypto";
import { getSetting, setSetting } from "./settings-store";

/** How long a narrative stays good. The numbers behind it move daily. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

type Cached = {
  /** Hash of the inputs. A different hash means the numbers moved. */
  inputHash: string;
  text: string;
  at: string;
};

/** Generations already running, so one slow render cannot start six. */
const inFlight = new Set<string>();

function hashOf(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

export type NarrativeRequest = {
  /**
   * Namespace for this narrative, e.g. "agency_week". Becomes part of
   * the settings key, so two callers cannot overwrite each other.
   */
  id: string;
  /** The numbers being summarised. Changing these invalidates the cache. */
  facts: string;
  system: string;
  user: string;
  maxTokens?: number;
};

/**
 * The cached narrative for these facts, or null.
 *
 * Null is a normal answer, not an error: it means "not generated yet",
 * and the caller renders without it. A background generation is started
 * unless one is already running for the same inputs.
 */
export async function cachedNarrative(
  req: NarrativeRequest,
): Promise<string | null> {
  const key = `narrative.${req.id}` as const;
  const inputHash = hashOf(req.facts);

  const stored = await getSetting<Cached>(key).catch(() => null);
  if (
    stored &&
    stored.inputHash === inputHash &&
    Date.now() - new Date(stored.at).getTime() < MAX_AGE_MS
  ) {
    return stored.text;
  }

  // Stale or missing. Generate for next time, and do not wait.
  void regenerate(key, inputHash, req);

  // A narrative written for different numbers is worse than none: it
  // states figures that are no longer on the screen next to it.
  return null;
}

async function regenerate(
  key: `narrative.${string}`,
  inputHash: string,
  req: NarrativeRequest,
): Promise<void> {
  const guard = `${key}:${inputHash}`;
  if (inFlight.has(guard)) return;
  inFlight.add(guard);
  try {
    const { callAI } = await import("./ai-call");
    const text = await callAI({
      system: req.system,
      user: req.user,
      maxTokens: req.maxTokens ?? 200,
      temperature: 0.4,
      timeoutMs: 20_000,
      feature: "general",
    });
    if (!text?.trim()) return;
    await setSetting(key, {
      inputHash,
      text: text.trim(),
      at: new Date().toISOString(),
    } satisfies Cached);
  } catch {
    // No provider, no quota, no network. The page renders without a
    // narrative, which is what it does anyway — there is nothing to
    // report and nowhere useful to report it from a background task.
  } finally {
    inFlight.delete(guard);
  }
}
