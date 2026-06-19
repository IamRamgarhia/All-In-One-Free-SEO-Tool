/**
 * Feedback-driven AI learning. Three pieces:
 *
 *   1. **logFeedback** — store an AI output + the user's verdict (and
 *      optional corrected version + free-text note). Every AI feature
 *      surfaces a thumbs-down + correction box; calling this is what
 *      records it.
 *
 *   2. **getActivePreferences** — return the curated, plain-language
 *      style rules for a feature (workspace + client). These get
 *      injected into the system prompt of subsequent AI calls so the
 *      model carries them forward.
 *
 *   3. **distillPreferences** — periodically (or on demand) walks
 *      recent feedback and asks the AI to extract durable preference
 *      rules. Promotes confidence levels over time. Idempotent — runs
 *      cheaply by capping examples per call.
 *
 * The point: this is RLHF-lite for self-hosted users. We never train
 * the model; we just get smarter prompts the more they use the tool.
 */

import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { aiFeedback, aiPreferences, type AiPreference } from "@/db/schema";
import { callAI } from "./ai-call";

export type AiFeature =
  | "exec_summary"
  | "blog_draft"
  | "title_rewrite"
  | "meta_rewrite"
  | "review_reply"
  | "content_idea"
  | "ai_sentiment"
  | "geo_swot"
  | "general";

export async function logFeedback(opts: {
  feature: AiFeature;
  clientId?: number | null;
  aiOutput: string;
  rating: 1 | -1;
  correctedOutput?: string;
  note?: string;
}): Promise<{ ok: boolean; id?: number }> {
  if (!opts.aiOutput.trim()) return { ok: false };
  const [row] = await db
    .insert(aiFeedback)
    .values({
      feature: opts.feature,
      clientId: opts.clientId ?? null,
      aiOutput: opts.aiOutput.slice(0, 20_000),
      correctedOutput: opts.correctedOutput?.slice(0, 20_000) ?? null,
      rating: opts.rating,
      note: opts.note?.slice(0, 2_000) ?? null,
    })
    .returning({ id: aiFeedback.id });
  return { ok: true, id: row.id };
}

/**
 * Returns the active rules for a feature, scoped to a client + workspace,
 * formatted as a system-prompt-ready bullet list. Returns an empty string
 * if there's nothing to inject.
 *
 * High-confidence rules are presented first; low-confidence are tagged so
 * the model knows to apply them more loosely.
 */
export async function getStylePromptForFeature(opts: {
  feature: AiFeature;
  clientId?: number | null;
}): Promise<string> {
  const rules = await loadActiveRules(opts);
  if (rules.length === 0) return "";

  const high = rules.filter((r) => r.confidence === "high");
  const med = rules.filter((r) => r.confidence === "medium");
  const low = rules.filter((r) => r.confidence === "low");

  const parts: string[] = ["Learned style rules from this user — apply these:"];
  for (const r of high) parts.push(`- ${r.rule}`);
  if (med.length > 0) {
    parts.push("Probable preferences (apply unless instructed otherwise):");
    for (const r of med) parts.push(`- ${r.rule}`);
  }
  if (low.length > 0) {
    parts.push("Tentative preferences (only one data point so far):");
    for (const r of low) parts.push(`- ${r.rule}`);
  }
  return parts.join("\n");
}

async function loadActiveRules(opts: {
  feature: AiFeature;
  clientId?: number | null;
}): Promise<AiPreference[]> {
  const conds = [
    eq(aiPreferences.active, true),
    or(
      eq(aiPreferences.feature, opts.feature),
      eq(aiPreferences.feature, "general"),
    )!,
  ];
  if (opts.clientId) {
    conds.push(
      or(
        isNull(aiPreferences.clientId),
        eq(aiPreferences.clientId, opts.clientId),
      )!,
    );
  } else {
    conds.push(isNull(aiPreferences.clientId));
  }
  return db
    .select()
    .from(aiPreferences)
    .where(and(...conds))
    .orderBy(desc(aiPreferences.confidence), desc(aiPreferences.updatedAt));
}

/**
 * Walk recent feedback and extract / promote preference rules.
 *
 * Strategy:
 *   - For each feature with ≥3 negative-rated rows that have correctedOutput,
 *     send (original, corrected) pairs to the AI and ask "what 1-3 rules
 *     would have produced the corrected version?"
 *   - Insert new rules at confidence=low.
 *   - When the same rule (case-insensitive substring match) shows up
 *     again, increment derived_from + bump confidence (low→medium→high).
 *
 * Cheap to run — capped at 12 examples per call. Idempotent.
 */
export async function distillPreferences(opts?: {
  feature?: AiFeature;
  clientId?: number;
  /** Only consider feedback newer than this (defaults to last 30 days). */
  since?: Date;
}): Promise<{ ruleCount: number }> {
  const since = opts?.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const conds = [gte(aiFeedback.createdAt, since), eq(aiFeedback.rating, -1)];
  if (opts?.feature) conds.push(eq(aiFeedback.feature, opts.feature));
  if (opts?.clientId) conds.push(eq(aiFeedback.clientId, opts.clientId));

  const rows = await db
    .select()
    .from(aiFeedback)
    .where(and(...conds))
    .orderBy(desc(aiFeedback.createdAt))
    .limit(12);

  const usable = rows.filter((r) => r.correctedOutput || r.note);
  if (usable.length < 2) return { ruleCount: 0 };

  // Build the LLM prompt
  const examples = usable
    .map((r, i) => {
      const lines = [`Example ${i + 1} — feature: ${r.feature}`];
      lines.push(`AI wrote: ${truncate(r.aiOutput)}`);
      if (r.correctedOutput) lines.push(`User edited to: ${truncate(r.correctedOutput)}`);
      if (r.note) lines.push(`User note: ${truncate(r.note, 300)}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const system = `You analyse user corrections of AI output and extract durable style rules — short, plain-language preferences that, if followed, would have produced the corrected version on the first try.

Output format: a JSON array of objects. Each object has:
  - "feature": one of "exec_summary", "blog_draft", "title_rewrite", "meta_rewrite", "review_reply", "content_idea", "general"
  - "rule": one short imperative sentence (e.g. "Avoid em-dashes.", "Always use UK English.", "Open exec summaries with the headline number first.")

Rules:
- ≤8 rules per response. Skip if no clear pattern.
- Imperative voice ("Use…", "Avoid…", "Prefer…").
- Each rule ≤120 characters.
- Don't restate the obvious ("be helpful", "be clear").
- If a correction is stylistic across multiple features, mark feature: "general".
- Output ONLY the JSON array. No commentary.`;

  const userMsg = `Corrections to analyse:\n\n${examples}\n\nReturn the JSON array of rules now.`;

  const raw = await callAI({
    system,
    user: userMsg,
    maxTokens: 800,
    temperature: 0.2,
    timeoutMs: 30_000,
    ignoreCreditSaver: true,
  });
  if (!raw) return { ruleCount: 0 };

  // Parse JSON, gracefully fail if model returned chatter
  const jsonText = extractJsonArray(raw);
  let parsed: { feature: string; rule: string }[];
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ruleCount: 0 };
  }
  if (!Array.isArray(parsed)) return { ruleCount: 0 };

  const VALID_FEATURES: AiFeature[] = [
    "exec_summary",
    "blog_draft",
    "title_rewrite",
    "meta_rewrite",
    "review_reply",
    "content_idea",
    "ai_sentiment",
    "geo_swot",
    "general",
  ];

  let count = 0;
  for (const p of parsed) {
    if (!p || typeof p.rule !== "string") continue;
    const feature = (VALID_FEATURES.includes(p.feature as AiFeature)
      ? (p.feature as AiFeature)
      : "general");
    const ruleClean = p.rule.trim().slice(0, 200);
    if (ruleClean.length < 5) continue;
    await upsertRule({
      feature,
      clientId: opts?.clientId ?? null,
      rule: ruleClean,
    });
    count++;
  }
  return { ruleCount: count };
}

async function upsertRule(opts: {
  feature: AiFeature;
  clientId: number | null;
  rule: string;
}): Promise<void> {
  // Find an existing rule with the same feature + scope + similar text
  const conds = [
    eq(aiPreferences.feature, opts.feature),
    opts.clientId
      ? eq(aiPreferences.clientId, opts.clientId)
      : isNull(aiPreferences.clientId),
  ];
  const existing = await db
    .select()
    .from(aiPreferences)
    .where(and(...conds));
  const same = existing.find(
    (r) => similar(r.rule, opts.rule) || r.rule === opts.rule,
  );

  if (same) {
    const newDerived = same.derivedFrom + 1;
    const newConfidence: "low" | "medium" | "high" =
      newDerived >= 5 ? "high" : newDerived >= 3 ? "medium" : "low";
    await db
      .update(aiPreferences)
      .set({
        derivedFrom: newDerived,
        confidence: newConfidence,
        updatedAt: new Date(),
        // Keep the longer phrasing if the new one's a superset
        rule: opts.rule.length > same.rule.length ? opts.rule : same.rule,
      })
      .where(eq(aiPreferences.id, same.id));
    return;
  }

  await db.insert(aiPreferences).values({
    feature: opts.feature,
    clientId: opts.clientId,
    rule: opts.rule,
    confidence: "low",
    derivedFrom: 1,
    active: true,
  });
}

function similar(a: string, b: string): boolean {
  // Very loose: case-insensitive substring or 80% Jaccard
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la.includes(lb) || lb.includes(la)) return true;
  const setA = new Set(la.split(/\s+/));
  const setB = new Set(lb.split(/\s+/));
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return inter / Math.max(1, union) >= 0.65;
}

function extractJsonArray(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith("[")) return trimmed;
  // Find the first [ ... ] block
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return "[]";
}

function truncate(s: string, max = 800): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}
