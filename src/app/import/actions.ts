"use server";

import { createWorker } from "tesseract.js";

export type OcrResult =
  | {
      ok: true;
      text: string;
      structured: ExtractedFields;
      provider: string;
    }
  | { ok: false; error: string };

export type ExtractedFields = {
  metrics: { label: string; value: string; previous?: string }[];
  queries: { query: string; position?: string; clicks?: string }[];
  date?: string;
  source?: string;
  notes?: string;
};

export async function extractScreenshotText(
  _prev: OcrResult | null,
  formData: FormData,
): Promise<OcrResult> {
  const dataUrl = String(formData.get("imageDataUrl") ?? "");
  if (!dataUrl.startsWith("data:image/")) {
    return { ok: false, error: "No image provided." };
  }

  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) {
    return { ok: false, error: "Invalid image data." };
  }
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > 8 * 1024 * 1024) {
    return { ok: false, error: "Image too large (>8 MB)." };
  }

  let text = "";
  try {
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(buffer);
    text = data.text.trim();
    await worker.terminate();
  } catch (err) {
    return {
      ok: false,
      error: `OCR failed: ${(err as Error).message}`,
    };
  }

  if (!text) {
    return {
      ok: false,
      error:
        "Couldn't read any text from this image. Try a higher-resolution screenshot.",
    };
  }

  // Try to enrich with LLM structured extraction; fall back to heuristic
  const llm = await tryLlmExtraction(text);
  const structured = llm ?? heuristicExtract(text);
  const provider = llm ? "AI extraction" : "Heuristic parser";

  return { ok: true, text, structured, provider };
}

async function tryLlmExtraction(text: string): Promise<ExtractedFields | null> {
  const { getActiveProvider, getApiKey } = await import("@/lib/api-keys");
  const active = await getActiveProvider();
  if (!active) return null;

  // Single-provider mode — only fetch the key for the active one.
  const gemini = active === "gemini" ? await getApiKey("gemini") : null;
  const groq = active === "groq" ? await getApiKey("groq") : null;
  const anthropic =
    active === "anthropic" ? await getApiKey("anthropic") : null;
  const openai = active === "openai" ? await getApiKey("openai") : null;
  if (!gemini && !groq && !anthropic && !openai) return null;

  const prompt = `You are extracting SEO data from text that was OCR'd from a screenshot.
The user pasted a screenshot from an SEO dashboard (GSC, GA4, Ahrefs, Semrush, etc.).

Return a strict JSON object with this shape:
{
  "metrics": [ { "label": "...", "value": "...", "previous": "..." (optional) } ],
  "queries": [ { "query": "...", "position": "..." (optional), "clicks": "..." (optional) } ],
  "date": "YYYY-MM-DD or period text" (optional),
  "source": "GSC | GA4 | Ahrefs | Semrush | Other" (optional),
  "notes": "any caveats or things you couldn't parse"
}

Only include items you can identify confidently. Empty arrays are fine.

Raw OCR text:
"""
${text.slice(0, 8000)}
"""

Reply with just the JSON object, no preamble.`;

  try {
    let raw: string | null = null;

    // Free providers first.
    if (!raw && gemini) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 25_000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${encodeURIComponent(gemini)}`,
        {
          method: "POST",
          signal: c.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              maxOutputTokens: 1500,
              temperature: 0.1,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        raw =
          data.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? null;
      }
    }

    if (!raw && groq) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 25_000);
      const res = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          signal: c.signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${groq}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            max_tokens: 1500,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content: prompt }],
          }),
        },
      );
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        raw = data.choices?.[0]?.message?.content ?? null;
      }
    }

    if (!raw && anthropic) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 25_000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": anthropic,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as {
          content?: { type: string; text?: string }[];
        };
        raw =
          data.content
            ?.filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("\n") ?? null;
      }
    }

    if (!raw && openai) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 25_000);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: c.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${openai}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          max_tokens: 1500,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }],
        }),
      });
      clearTimeout(t);
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        raw = data.choices?.[0]?.message?.content ?? null;
      }
    }

    if (!raw) return null;
    // Strip code fences if Claude added them
    const json = raw
      .replace(/^```(?:json)?/m, "")
      .replace(/```\s*$/m, "")
      .trim();
    const parsed = JSON.parse(json) as ExtractedFields;
    return parsed;
  } catch {
    return null;
  }
}

function heuristicExtract(text: string): ExtractedFields {
  // Pull "Label: Value" pairs and try to detect metric blocks
  const metrics: ExtractedFields["metrics"] = [];
  const lines = text.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

  // Pattern: "Label: 1,234" or "Label 1,234"
  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z\s]+?)[:\s]+([\d,.%]+)$/);
    if (m && m[1].length < 50) {
      metrics.push({ label: m[1].trim(), value: m[2].trim() });
    }
  }

  // Crude date detection
  const dateMatch = text.match(/\b(\d{1,2}\s+\w+\s+\d{4})\b|\b(\d{4}-\d{2}-\d{2})\b/);

  return {
    metrics: metrics.slice(0, 20),
    queries: [],
    date: dateMatch?.[0],
    notes: metrics.length === 0
      ? "No obvious key:value pairs found. Try connecting an API key for smarter extraction."
      : undefined,
  };
}
