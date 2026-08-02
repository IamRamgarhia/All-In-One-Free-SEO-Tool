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
   * Preferred model. Tried first, then the standard fallback chain
   * (gemini-2.5-flash → 2.0-flash → 1.5-flash-latest → 1.5-flash).
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
 * Tried in order when the requested model fails. Google retired the
 * entire Gemini 1.5 family from the API in Sept 2025 and deprecated the
 * `-latest` suffix, so the two 1.5 entries this list used to carry were
 * guaranteed 404s — two extra round trips on the way to every failure,
 * and a misleading "tried 4 models" in the logs.
 */
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

export async function callGemini(opts: GeminiCallOpts): Promise<string | null> {
  // Build the Gemini contents payload once — reused across all retries.
  const contents = buildContents(opts.system, opts.messages);
  const body = JSON.stringify({
    contents,
    generationConfig: {
      maxOutputTokens: opts.maxTokens,
      temperature: opts.temperature,
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
        body,
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
