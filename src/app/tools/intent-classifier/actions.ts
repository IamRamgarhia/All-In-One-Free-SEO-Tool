"use server";

import { callAI, lastAiFailure } from "@/lib/ai-call";
import type { AiFailure } from "@/lib/ai-error";
import { saveToolRun } from "@/lib/tool-runs";

export type IntentRow = {
  query: string;
  intent: "informational" | "navigational" | "commercial" | "transactional" | "local";
  confidence: number;
  recommendedFormat: string;
};

export type IntentState =
  | { ok: true; rows: IntentRow[]; aiFailure?: AiFailure | null }
  | { ok: false; error: string };

const SYSTEM = `You classify search-query intent. For each query, return ONE of:
- informational ("how to", "what is")
- navigational ("brand name", site finder)
- commercial ("best", "vs", "review", "comparison")
- transactional ("buy", "price", "near me", "book")
- local ("near me", city/locality + service)

Also recommend the BEST content format for each.

Output JSON only — array of objects:
[{"query":"<q>","intent":"<intent>","confidence":0.0-1.0,"recommendedFormat":"<short string e.g. 'how-to article','listicle','product page','calculator','category page'>"}]

Strict rules: skip queries shorter than 2 chars. Output JSON array only, no commentary.`;

const REGEX_FALLBACK: { intent: IntentRow["intent"]; re: RegExp }[] = [
  { intent: "transactional", re: /\b(buy|order|book|pricing|price of|hire|rent|subscribe|near me)\b/i },
  { intent: "commercial", re: /\b(best|top \d|review|compare|vs|alternative|cheapest|recommended)\b/i },
  { intent: "local", re: /\bnear me\b|\bin (?:[a-z]+ ){0,3}(?:city|town|village|area|neighborhood)\b/i },
  { intent: "informational", re: /\b(how|what|why|guide|tutorial|tips|examples|meaning|definition)\b/i },
];

function fallbackClassify(q: string): IntentRow {
  for (const p of REGEX_FALLBACK) {
    if (p.re.test(q)) {
      return {
        query: q,
        intent: p.intent,
        confidence: 0.55,
        recommendedFormat:
          p.intent === "transactional"
            ? "product / service page"
            : p.intent === "commercial"
              ? "comparison / listicle"
              : p.intent === "local"
                ? "local landing page"
                : p.intent === "informational"
                  ? "how-to / guide article"
                  : "homepage / brand page",
      };
    }
  }
  return {
    query: q,
    intent: "navigational",
    confidence: 0.3,
    recommendedFormat: "homepage / brand page",
  };
}

export async function runClassify(
  _prev: IntentState | null,
  formData: FormData,
): Promise<IntentState> {
  const raw = String(formData.get("queries") ?? "").trim();
  if (!raw) return { ok: false, error: "Paste at least one query." };
  const queries = Array.from(
    new Set(
      raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 2),
    ),
  ).slice(0, 200);
  if (queries.length === 0) return { ok: false, error: "No valid queries." };

  // Try AI first
  const aiPrompt = queries.map((q) => `- ${q}`).join("\n");
  const aiText = await callAI({
    system: SYSTEM,
    user: aiPrompt,
    maxTokens: 1500,
    temperature: 0.2,
    timeoutMs: 30_000,
    feature: "general",
  });

  if (aiText) {
    const cleaned = aiText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const start = cleaned.indexOf("[");
    const end = cleaned.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
        const rows: IntentRow[] = [];
        for (const p of parsed) {
          if (!p || typeof p !== "object") continue;
          const o = p as Record<string, unknown>;
          if (
            typeof o.query === "string" &&
            typeof o.intent === "string" &&
            ["informational", "navigational", "commercial", "transactional", "local"].includes(
              o.intent,
            ) &&
            typeof o.recommendedFormat === "string"
          ) {
            rows.push({
              query: o.query,
              intent: o.intent as IntentRow["intent"],
              confidence:
                typeof o.confidence === "number" ? Math.max(0, Math.min(1, o.confidence)) : 0.7,
              recommendedFormat: o.recommendedFormat,
            });
          }
        }
        if (rows.length > 0) {
          await saveToolRun({
            toolId: "intent-classifier",
            label: `${rows.length} queries classified`,
            input: { queries },
            result: { ok: true, rows },
          }).catch(() => undefined);
          return { ok: true, rows, aiFailure: lastAiFailure() };
        }
      } catch {
        // fall through to regex
      }
    }
  }

  // Regex fallback when AI unavailable
  const rows = queries.map(fallbackClassify);
  await saveToolRun({
    toolId: "intent-classifier",
    label: `${rows.length} queries classified (regex fallback)`,
    input: { queries },
    result: { ok: true, rows },
  }).catch(() => undefined);
  return { ok: true, rows, aiFailure: lastAiFailure() };
}
