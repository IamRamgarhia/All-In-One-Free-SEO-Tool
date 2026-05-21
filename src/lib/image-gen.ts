/**
 * AI image generation for content (blog hero, OG image, illustrative images).
 *
 * Free-first routing (matches the project-wide "no paid API required"
 * stance):
 *   1. If the caller passes `provider: "openai"` AND the user has an
 *      OpenAI key configured, use DALL-E 3 (paid, high quality).
 *   2. Otherwise fall back to Pollinations.ai — a public free image
 *      service that accepts a prompt as a URL parameter and returns a
 *      PNG. No key, no signup, no rate-limit on reasonable use. The
 *      tool always works out of the box; OpenAI is an optional upgrade.
 *
 * Returns the generated image as a base64 data URL so the UI can
 * download / copy without server file storage.
 *
 * Local-only alternative (future): plug Ollama + a diffusion model.
 * We'll route there once an open API exists for it.
 */

import { getApiKey } from "./api-keys";

export type ImageGenInput = {
  prompt: string;
  /** Aspect ratio preset — maps to the right size argument per provider. */
  aspect: "square" | "landscape" | "portrait";
  /** "standard" or "hd" (more detail, more cost). OpenAI only. */
  quality?: "standard" | "hd";
  /** Photo / illustration / vector / 3D rendering. OpenAI only. */
  style?: "natural" | "vivid";
  /**
   * Provider preference. "auto" picks OpenAI if a key is configured,
   * otherwise falls back to Pollinations.ai. "pollinations" forces the
   * free path. "openai" requires the user to have a key.
   */
  provider?: "auto" | "pollinations" | "openai";
};

export type ImageGenResult =
  | {
      ok: true;
      /** data:image/png;base64,... ready to drop in an <img src>. */
      dataUrl: string;
      /** Echo of the prompt used (some providers rewrite). */
      revisedPrompt?: string;
      provider: "openai" | "pollinations";
      model: string;
      sizeBytes: number;
    }
  | { ok: false; error: string };

const OPENAI_SIZE_MAP: Record<ImageGenInput["aspect"], string> = {
  square: "1024x1024",
  landscape: "1792x1024",
  portrait: "1024x1792",
};

// Pollinations.ai uses width × height query params and returns PNG.
const POLLINATIONS_SIZE_MAP: Record<
  ImageGenInput["aspect"],
  { w: number; h: number }
> = {
  square: { w: 1024, h: 1024 },
  landscape: { w: 1792, h: 1024 },
  portrait: { w: 1024, h: 1792 },
};

export async function generateImage(
  input: ImageGenInput,
): Promise<ImageGenResult> {
  if (!input.prompt.trim())
    return { ok: false, error: "Prompt is required." };

  const wanted = input.provider ?? "auto";
  const openaiKey = await getApiKey("openai");

  // Decide route
  let route: "openai" | "pollinations";
  if (wanted === "openai") {
    if (!openaiKey) {
      return {
        ok: false,
        error:
          "Requested OpenAI but no API key is set. Switch provider to 'auto' / 'pollinations' for the free path, or add a key in Settings → AI provider.",
      };
    }
    route = "openai";
  } else if (wanted === "pollinations") {
    route = "pollinations";
  } else {
    // auto: prefer OpenAI when key present (better quality), else free
    route = openaiKey ? "openai" : "pollinations";
  }

  if (route === "pollinations") {
    return await callPollinations(input);
  }
  return await callOpenAI(input, openaiKey as string);
}

async function callPollinations(
  input: ImageGenInput,
): Promise<ImageGenResult> {
  const { w, h } = POLLINATIONS_SIZE_MAP[input.aspect] ?? { w: 1024, h: 1024 };
  // The image.pollinations.ai endpoint is a public GET that returns PNG.
  // We append `nologo=true` to suppress the watermark and a random
  // seed so re-requests with the same prompt give variation.
  const seed = Math.floor(Math.random() * 1_000_000);
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(input.prompt.slice(0, 1500))}` +
    `?width=${w}&height=${h}&nologo=true&seed=${seed}`;

  const ctl = new AbortController();
  const tid = setTimeout(() => ctl.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) {
      return {
        ok: false,
        error: `Pollinations responded ${res.status}. Try again, or switch to OpenAI in settings.`,
      };
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    return {
      ok: true,
      dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
      provider: "pollinations",
      model: "pollinations-default",
      sizeBytes: buf.length,
    };
  } catch (err) {
    return {
      ok: false,
      error: `Pollinations request failed: ${(err as Error).message}`,
    };
  } finally {
    clearTimeout(tid);
  }
}

async function callOpenAI(
  input: ImageGenInput,
  apiKey: string,
): Promise<ImageGenResult> {
  const size = OPENAI_SIZE_MAP[input.aspect] ?? "1024x1024";
  const quality = input.quality ?? "standard";
  const style = input.style ?? "vivid";
  const model = "dall-e-3";

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: input.prompt.slice(0, 4000),
      n: 1,
      size,
      quality,
      style,
      response_format: "b64_json",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return {
      ok: false,
      error: `OpenAI image gen failed (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  type OpenAIImageResponse = {
    data?: { b64_json?: string; revised_prompt?: string }[];
  };
  const json = (await res.json()) as OpenAIImageResponse;
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) {
    return { ok: false, error: "OpenAI returned no image data" };
  }
  const buf = Buffer.from(b64, "base64");
  return {
    ok: true,
    dataUrl: `data:image/png;base64,${b64}`,
    revisedPrompt: json.data?.[0]?.revised_prompt,
    provider: "openai",
    model,
    sizeBytes: buf.length,
  };
}
