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

export async function callOpenAICompat(
  opts: OpenAICompatCallOpts,
): Promise<string | null> {
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
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error(
      `[${opts.caller ?? "openai-compat"}] ${opts.model} call failed:`,
      (err as Error).message,
    );
    return null;
  } finally {
    clearTimeout(t);
  }
}
