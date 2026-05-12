/**
 * Single shared caller for every provider that speaks the OpenAI
 * Chat-Completions wire protocol: OpenAI, Groq, OpenRouter, Perplexity,
 * Mistral, DeepSeek, Cerebras, Together, GitHub Models, and most
 * self-hosted LLM gateways.
 *
 * They differ only in endpoint URL, default model, and a couple of
 * provider-specific headers (OpenRouter's x-title, etc). The caller
 * passes those in; everything else (auth, payload shape, response
 * parsing, abort, error logging) is shared here.
 *
 * Returns null on failure, never throws — keeps caller boilerplate
 * minimal.
 */

export type OpenAICompatMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "user";
      content: string;
      image: { mimeType: string; base64: string };
    };

export type OpenAICompatCallOpts = {
  endpoint: string;
  apiKey: string;
  /** Provider-specific model id. No fallback; users pick from settings. */
  model: string;
  system: string;
  messages: OpenAICompatMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  /** Provider-specific extras (OpenRouter's x-title, etc.) */
  extraHeaders?: Record<string, string>;
  /** Origin tag for server-log debugging */
  caller?: string;
};

/**
 * Status codes worth retrying once.
 *   0 — network error / abort
 *   429 — rate-limited (free tiers + burst protection)
 *   500/502/503/504 — transient server issues
 * Permanent failures (400 bad request, 401 bad key, 404 wrong model)
 * are NOT retried — retrying just wastes time.
 */
const RETRY_STATUSES = new Set([0, 429, 500, 502, 503, 504]);
const RETRY_BACKOFF_MS = 1500;

export async function callOpenAICompat(
  opts: OpenAICompatCallOpts,
): Promise<string | null> {
  // One retry with backoff. Most rate-limits are bursty and a 1.5s
  // delay is enough to slip past — the global ai-semaphore further
  // reduces the chance of hitting 429 in the first place.
  let attempt = 0;
  while (true) {
    const result = await dispatchOpenAICompat(opts);
    if (result.ok) return result.text;
    if (attempt >= 1 || !RETRY_STATUSES.has(result.status)) {
      return null;
    }
    attempt++;
    await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
  }
}

async function dispatchOpenAICompat(
  opts: OpenAICompatCallOpts,
): Promise<{ ok: true; text: string | null } | { ok: false; status: number }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs);
  try {
    const messages: unknown[] = [];
    if (opts.system) {
      messages.push({ role: "system", content: opts.system });
    }
    for (const m of opts.messages) {
      if ("image" in m && m.image) {
        messages.push({
          role: m.role,
          content: [
            { type: "text", text: m.content },
            {
              type: "image_url",
              image_url: {
                url: `data:${m.image.mimeType};base64,${m.image.base64}`,
              },
            },
          ],
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const res = await fetch(opts.endpoint, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${opts.apiKey}`,
        ...(opts.extraHeaders ?? {}),
      },
      body: JSON.stringify({
        model: opts.model,
        messages,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
      }),
    });
    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 240);
      console.error(
        `[${opts.caller ?? "openai-compat"}] ${opts.model} ${res.status}: ${errBody || res.statusText}`,
      );
      return { ok: false, status: res.status };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return {
      ok: true,
      text: data.choices?.[0]?.message?.content?.trim() || null,
    };
  } catch (err) {
    console.error(
      `[${opts.caller ?? "openai-compat"}] ${opts.model} call failed:`,
      (err as Error).message,
    );
    // Network / abort — treat as retryable (status 0 conventionally).
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(t);
  }
}
