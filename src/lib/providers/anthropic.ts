/**
 * Single source of truth for Anthropic Claude chat calls. Previously
 * duplicated across ai-call.ts, ai-vision.ts, assistant/actions.ts,
 * import/actions.ts, llm-citation.ts.
 *
 * Owns the consistent behavior:
 *   - Default model: claude-haiku-4-5-20251001 (cheapest + fastest current)
 *   - System parameter as native Anthropic field (no prepending needed)
 *   - Prompt caching: system block ≥4000 chars → cache_control: ephemeral
 *     (subsequent calls within 5 min are billed at ~10% input cost)
 *   - Vision: inline base64 images via image content block
 *   - AbortController with timeout
 *   - Returns null on any non-200, never throws (so callers don't need
 *     try/catch around it)
 */

export type AnthropicMessage =
  | { role: "user" | "assistant"; content: string }
  | {
      role: "user";
      content: string;
      image: { mimeType: string; base64: string };
    };

export type AnthropicCallOpts = {
  apiKey: string;
  /** Default: claude-haiku-4-5-20251001 (current cheapest fast model) */
  model?: string;
  system: string;
  messages: AnthropicMessage[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  /** Origin tag for server-log debugging */
  caller?: string;
};

export async function callAnthropic(
  opts: AnthropicCallOpts,
): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs);
  try {
    // Anthropic prompt caching: big system blocks get marked ephemeral.
    // Repeat calls within 5 min reuse the cache (~10% input cost).
    const useCache = (opts.system?.length ?? 0) > 4000;
    const systemPayload = useCache
      ? [
          {
            type: "text" as const,
            text: opts.system,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : opts.system;

    const messages = opts.messages.map((m) => {
      if ("image" in m && m.image) {
        return {
          role: m.role,
          content: [
            {
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: m.image.mimeType,
                data: m.image.base64,
              },
            },
            { type: "text" as const, text: m.content },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model || "claude-haiku-4-5-20251001",
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        system: systemPayload,
        messages,
      }),
    });
    if (!res.ok) {
      const errBody = (await res.text().catch(() => "")).slice(0, 240);
      console.error(
        `[${opts.caller ?? "anthropic"}] Anthropic ${res.status}: ${errBody || res.statusText}`,
      );
      return null;
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    return (
      data.content
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("")
        .trim() || null
    );
  } catch (err) {
    console.error(
      `[${opts.caller ?? "anthropic"}] Anthropic call failed:`,
      (err as Error).message,
    );
    return null;
  } finally {
    clearTimeout(t);
  }
}
