/**
 * Single source of truth for Google Gemini chat calls. Previously there
 * were three copy-pasted versions of this in ai-call.ts, ai-vision.ts,
 * and assistant/actions.ts — each with its own subtle bugs and its own
 * hardcoded model name. When Google retired gemini-pro and renamed
 * flash variants, every place broke independently.
 *
 * This module exposes ONE function: callGemini(). All callers delegate.
 *
 * What it handles:
 *   - Model fallback chain (newest free-tier flash names, tried in order)
 *   - Per-request AbortController (one bad model can't cascade-abort others)
 *   - Total deadline budget so we don't exceed the caller's timeout
 *   - Vision payloads (inline base64 images, alongside text turns)
 *   - System-prompt prepending (Gemini has no system role)
 *   - Safety-block / empty-reply detection (try next model instead of null)
 *   - Key-level error short-circuit (401/403/API_KEY_INVALID → stop trying)
 */

export type GeminiMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "user";
      content: string;
      image: { mimeType: string; base64: string };
    };

export type GeminiCallOpts = {
  apiKey: string;
  /**
   * Preferred model. Tried first, then FALLBACK_MODELS below.
   * Pass undefined to skip straight to the chain.
   */
  model?: string;
  /** Prepended to the first user turn — Gemini has no system role. */
  system: string;
  messages: GeminiMessage[];
  maxTokens: number;
  temperature: number;
  /** Total wall-clock budget across all fallback attempts. */
  timeoutMs: number;
  /** Where this call originated — surfaced in console.error logs. */
  caller?: string;
  /**
   * Optional sink for failure details. The function still returns
   * `string | null` so existing call sites are untouched — but a caller
   * that wants to tell the USER why (callAI) passes this and gets the
   * status + body of the last attempt.
   */
  onFailure?: (status: number, body: string) => void;
};

/**
 * Tried in order when the requested model fails.
 *
 * This list has now rotted twice. The 1.5 family went in Sept 2025, and
 * gemini-2.0-flash went after it — each time leaving entries that were
 * guaranteed 404s, costing a round trip on the way to every failure and
 * logging a misleading "tried N models".
 *
 * What was learned the second time: the deprecation was of VERSION-PINNED
 * aliases (gemini-1.5-flash-latest), not of the unversioned ones. The bare
 * aliases are the only ids that survive Google retiring a release, so the
 * fallbacks are those and the pinned version leads.
 */
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  // Was gemini-2.0-flash, which Google has now retired too — it answers
  // 404, so the only thing standing behind an exhausted 2.5 quota was a
  // model that did not exist. The symptom was every AI tool failing with
  // a 429 naming 2.5-flash, while a working model sat one line away.
  //
  // These two are deliberately different in kind, not just in name: an
  // alias that tracks whatever Flash currently is, and the lite tier,
  // which carries its own free quota. A list of three sibling versions
  // would have died together the same way the 1.5 family did.
  //
  // Both aliases rather than pinned versions, and that is the lesson
  // rather than a preference: gemini-2.5-flash-lite was tried here first
  // and answered 404 with "no longer available to new users" — while
  // still being listed by the models endpoint. Appearing in the listing
  // is not the same as being callable, so these were each verified by
  // actually calling them.
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
] as const;

/**
 * Whether this model accepts `thinkingConfig` at all.
 *
 * It is not universally ignored, which is what the comment below used to
 * claim. gemini-flash-lite-latest answers 400 INVALID_ARGUMENT when it
 * is present — so sending it unconditionally, as the first version of
 * this fix did, broke the very fallback that was added alongside it. The
 * chain went dead at the exact moment it was needed, and the error said
 * "invalid argument" rather than naming the field.
 *
 * Verified by calling each model both ways: lite refuses it, the others
 * accept it. Opt-in by name, so a model nobody has tested gets the
 * request that is known to work everywhere.
 */
function acceptsThinkingConfig(model: string): boolean {
  return /^gemini-(2\.5|3)/.test(model) || model === "gemini-flash-latest";
}

export async function callGemini(opts: GeminiCallOpts): Promise<string | null> {
  // Build the Gemini contents payload once — reused across all retries.
  const contents = buildContents(opts.system, opts.messages);
  /**
   * Per model, because the request is not the same for all of them.
   *
   * Thinking is turned off wherever it is supported: gemini-2.5-flash
   * reasons before answering by default and those tokens come out of
   * maxOutputTokens, so a 600-token budget for a short JSON summary was
   * spent thinking and the answer arrived cut off at 87 characters with
   * no closing brace. Every caller here wants structured output, not a
   * chain of reasoning. That one change took the AI tool sweep from 7
   * passing to 14.
   */
  const bodyFor = (model: string) =>
    JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: opts.maxTokens,
        temperature: opts.temperature,
        ...(acceptsThinkingConfig(model)
          ? { thinkingConfig: { thinkingBudget: 0 } }
          : {}),
      },
    });

  const tryList = opts.model
    ? [opts.model, ...FALLBACK_MODELS.filter((m) => m !== opts.model)]
    : [...FALLBACK_MODELS];

  const deadline = Date.now() + opts.timeoutMs;
  let lastError = "";
  let lastStatus = 0;

  for (const model of tryList) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      lastError = lastError || "Gemini timed out before any model responded";
      break;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Math.min(remaining, 30_000));
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`;
      const res = await fetch(url, {
        method: "POST",
        signal: ctl.signal,
        headers: { "content-type": "application/json" },
        body: bodyFor(model),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: {
            content?: { parts?: { text?: string }[] };
            finishReason?: string;
          }[];
          promptFeedback?: { blockReason?: string };
        };
        const reply =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("")
            .trim() || null;

        // Truncated, not malformed. Returning the fragment let every
        // caller's JSON parser fail with "AI returned an unexpected
        // format", which blames the model for what is a budget the
        // caller set. Half an answer is also worse than none: a summary
        // cut mid-sentence reads as a real answer to anyone skimming.
        if (reply && data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
          lastError =
            `Gemini [${model}] ran out of output tokens before finishing. ` +
            `Raise maxTokens for this call — it is currently ${opts.maxTokens}.`;
          opts.onFailure?.(200, lastError);
          continue;
        }

        if (reply) return reply;
        // 200 OK with empty body — usually a safety filter or maxTokens=0.
        // Falling through to the next model lets users escape Gemini's
        // occasional aggressive safety blocks.
        lastError = `Gemini [${model}] empty (${data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? "no candidates"})`;
        continue;
      }
      const errBody = (await res.text().catch(() => "")).slice(0, 240);
      lastError = `Gemini ${res.status} [${model}]: ${errBody || res.statusText}`;
      lastStatus = res.status;
      // Key-level failures: no point trying other models with the same key
      if (res.status === 401 || res.status === 403) break;
      if (
        res.status === 400 &&
        /API_KEY_INVALID|API key not valid/i.test(errBody)
      )
        break;
      // Everything else (404 wrong model, 429 quota, 5xx server) → try next
    } catch (err) {
      lastError = `Gemini [${model}]: ${(err as Error).message}`;
    } finally {
      clearTimeout(t);
    }
  }

  console.error(`[${opts.caller ?? "gemini"}] Gemini failed:`, lastError);
  opts.onFailure?.(lastStatus, lastError);
  return null;
}

function buildContents(
  system: string,
  messages: GeminiMessage[],
): unknown[] {
  const out: unknown[] = [];
  let prepended = false;
  for (const m of messages) {
    const parts: unknown[] = [];
    // Inject system prompt into the FIRST user turn (Gemini has no system role)
    if (!prepended && m.role === "user") {
      parts.push({ text: `${system}\n\n${m.content}` });
      prepended = true;
    } else {
      parts.push({ text: m.content });
    }
    if ("image" in m && m.image) {
      parts.push({
        inlineData: {
          mimeType: m.image.mimeType,
          data: m.image.base64,
        },
      });
    }
    out.push({
      role: m.role === "assistant" ? "model" : "user",
      parts,
    });
  }
  // Edge case: empty messages array — still attach the system as a lone user turn
  // so the caller doesn't get an unhelpful 400.
  if (!prepended) {
    out.push({ role: "user", parts: [{ text: system }] });
  }
  return out;
}
