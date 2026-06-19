/**
 * Brand-mention sentiment classifier.
 *
 * Given an LLM response that mentions a brand (Acme), figures out
 * whether the mention is positive, neutral, negative, or mixed —
 * AND assigns a -100..+100 score for tracking sentiment drift over
 * time. Runs through the user's already-configured AI provider so
 * it works free on Gemini / Groq / OpenRouter free tiers.
 *
 * Why this matters: "ChatGPT mentioned us" is incomplete signal.
 * "ChatGPT called us innovative" and "ChatGPT called us overpriced"
 * are both mentions but should land in very different KPIs.
 *
 * Inputs: the response text + the brand name we're scoring against.
 * Output: { sentiment, score, reason } OR null when classification
 * fails (free-tier rate limit, model hallucinated bad JSON, etc.).
 *
 * Free-first: no paid API call. Uses callAI which routes to whatever
 * provider the user has configured (free tier works fine).
 */

import { callAI } from "./ai-call";

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

export type SentimentResult = {
  sentiment: Sentiment;
  score: number; // -100..+100
  reason: string;
};

const SYSTEM_PROMPT = `You classify how a brand is portrayed in a piece of text.

Rules:
- Output ONE valid JSON object only. No prose before or after.
- Schema: {"sentiment": "positive"|"neutral"|"negative"|"mixed", "score": -100..100, "reason": "<<=25 words>>"}
- "score" is centered at 0 (neutral). +100 = glowing endorsement. -100 = harsh criticism.
- "mixed" means substantive positive AND negative content in the same passage.
- "neutral" means factual / passing mention without judgment.
- If the brand isn't actually mentioned or judged, return {"sentiment":"neutral","score":0,"reason":"no judgment found"}.
- The reason should quote / paraphrase the specific words that drove your call.`;

export async function classifySentiment(
  text: string,
  brand: string,
  opts?: { clientId?: number | null },
): Promise<SentimentResult | null> {
  // Cheap guard: empty text or no brand mention → skip the LLM call.
  if (!text || text.length < 20) return null;
  const lower = text.toLowerCase();
  const brandLower = brand.toLowerCase().trim();
  if (brandLower && !lower.includes(brandLower)) {
    // The mention check upstream usually catches this, but doubling up
    // avoids wasted tokens on the unlucky case.
    return { sentiment: "neutral", score: 0, reason: "brand not directly mentioned" };
  }

  const userPrompt = `Brand: ${brand}\n\nText:\n${text.slice(0, 3000)}\n\nClassify how this text portrays "${brand}". Return ONLY the JSON object.`;

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    maxTokens: 200,
    temperature: 0.1,
    timeoutMs: 20_000,
    feature: "ai_sentiment",
    clientId: opts?.clientId ?? null,
    ignoreCreditSaver: false, // OK to skip under credit-saver — this is nice-to-have
  });

  if (!raw) return null;
  return parseSentiment(raw);
}

/**
 * Tolerant JSON extraction. Models sometimes wrap the JSON in markdown
 * code fences or prepend "Here's the classification:". We grab the
 * first balanced { ... } block.
 */
function parseSentiment(raw: string): SentimentResult | null {
  const trimmed = raw.trim();
  // Find the first { and the matching close
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === "{") depth++;
    else if (trimmed[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const jsonStr = trimmed.slice(start, end + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const sentRaw = String(obj.sentiment ?? "").toLowerCase();
  const sentiment: Sentiment =
    sentRaw === "positive" ||
    sentRaw === "negative" ||
    sentRaw === "mixed" ||
    sentRaw === "neutral"
      ? (sentRaw as Sentiment)
      : "neutral";

  let score = Number(obj.score ?? 0);
  if (!Number.isFinite(score)) score = 0;
  // Clamp to bounds
  score = Math.max(-100, Math.min(100, Math.round(score)));

  const reason = String(obj.reason ?? "").slice(0, 200);
  return { sentiment, score, reason };
}
