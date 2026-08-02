"use server";

import { callAI, lastAiFailure } from "@/lib/ai-call";
import type { AiFailure } from "@/lib/ai-error";
import { scanSerp } from "@/lib/serp-scanner";
import { saveToolRun } from "@/lib/tool-runs";

export type AttackBrief = {
  targetKeyword: string;
  searchIntent: "informational" | "commercial" | "transactional" | "navigational";
  vulnerabilityScore: number;
  competitorWeakness: string;
  serpMedianWordCount: number;
  recommendedWordCount: number;
  requiredEeat: string[];
  requiredSchema: string[];
  internalLinkTargets: string[];
  aioPassageHints: string[];
  topCompetitors: { position: number; domain: string; title: string }[];
  paaQuestions: string[];
  definitionOfDone: string;
};

export type AttackState =
  | { ok: true; briefs: AttackBrief[]; aiFailure?: AiFailure | null }
  | { ok: false; error: string }
  | null;

export async function generateAttackBriefs(
  _prev: AttackState,
  formData: FormData,
): Promise<AttackState> {
  const keywordsRaw = String(formData.get("keywords") ?? "").trim();
  const competitorDomain = String(formData.get("competitor") ?? "").trim();
  const country = String(formData.get("country") ?? "US").trim() || "US";
  if (!keywordsRaw)
    return { ok: false, error: "Paste at least one target keyword." };
  const keywords = keywordsRaw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 5);
  if (keywords.length === 0)
    return { ok: false, error: "No valid keywords." };

  const briefs: AttackBrief[] = [];

  for (const keyword of keywords) {
    const serp = await scanSerp({ query: keyword, country });
    if (!serp.ok) {
      // Best-effort — skip this keyword
      continue;
    }

    const top = serp.topResults.slice(0, 10);
    // Vulnerability: competitor ranking 4-15 with thin/dated content
    let vulnerabilityScore = 50;
    let competitorWeakness = "Competitor is entrenched (top 3).";
    const competitorMatch = competitorDomain
      ? top.find((r) =>
          r.domain.toLowerCase().includes(competitorDomain.toLowerCase()),
        )
      : null;
    if (competitorMatch && competitorMatch.position >= 4) {
      vulnerabilityScore = Math.min(
        90,
        50 + (competitorMatch.position - 4) * 5,
      );
      competitorWeakness = `${competitorMatch.domain} ranks at #${competitorMatch.position} — vulnerable, not entrenched.`;
    } else if (!competitorMatch && competitorDomain) {
      vulnerabilityScore = 70;
      competitorWeakness = `${competitorDomain} not in top 10 — opportunity to capture before they do.`;
    }
    // Penalize if Wikipedia/Reddit holds top spot
    const wikipediaTop = top
      .slice(0, 3)
      .some((r) => /wikipedia\.org/i.test(r.domain));
    if (wikipediaTop) vulnerabilityScore -= 25;

    // SERP median word count — approximate from result count + intent
    const intentText = `${keyword} ${top.map((r) => r.title).join(" ")}`.toLowerCase();
    let intent: AttackBrief["searchIntent"] = "informational";
    if (/(buy|deal|coupon|discount|price)/i.test(intentText))
      intent = "transactional";
    else if (/(best|top|review|compare|vs|alternative)/i.test(intentText))
      intent = "commercial";
    else if (/(login|sign in|contact)/i.test(intentText)) intent = "navigational";
    const serpMedian =
      intent === "informational"
        ? 1800
        : intent === "commercial"
          ? 2200
          : 900;

    const aiPrompt = `Build a Content Attack Brief targeting "${keyword}" (${intent}, ${country}). Top 10 SERP positions:
${top
  .map((r) => `${r.position}. ${r.domain} — ${r.title}`)
  .join("\n")}

People Also Ask: ${serp.paaQuestions.slice(0, 8).join(" | ")}

Output JSON only with: { "requiredEeat": [...], "requiredSchema": [...], "internalLinkTargets": [...], "aioPassageHints": [...], "definitionOfDone": "..." }. Each array 3-5 items, each string under 120 chars.`;

    let aiData: {
      requiredEeat: string[];
      requiredSchema: string[];
      internalLinkTargets: string[];
      aioPassageHints: string[];
      definitionOfDone: string;
    } = {
      requiredEeat: [
        "Named author with Person schema + sameAs to LinkedIn",
        "≥2 outbound citations to primary sources",
        "First-hand example or original data point",
      ],
      requiredSchema: ["Article + embedded Person", "FAQPage (only if genuine FAQ)"],
      internalLinkTargets: [
        "Closest pillar page on the same topic",
        "Top 2-3 supporting blog posts already ranking",
      ],
      aioPassageHints: [
        "Open each H2 with a direct definition",
        "Include one specific number / proper noun per ~250 words",
        "End each H2 with a 134-167 word self-contained chunk",
      ],
      definitionOfDone: "Ranks top-10 within 60 days OR retire and re-target.",
    };
    const aiText = await callAI({
      system: "You output structured JSON content briefs. Never preamble.",
      user: aiPrompt,
      maxTokens: 700,
      temperature: 0.4,
      feature: "content_idea",
    });
    if (aiText) {
      const m = aiText.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]);
          if (parsed && typeof parsed === "object") {
            aiData = { ...aiData, ...(parsed as typeof aiData) };
          }
        } catch {
          // ignore
        }
      }
    }

    briefs.push({
      targetKeyword: keyword,
      searchIntent: intent,
      vulnerabilityScore: Math.max(0, Math.min(100, vulnerabilityScore)),
      competitorWeakness,
      serpMedianWordCount: serpMedian,
      recommendedWordCount: Math.round(serpMedian * 1.1),
      requiredEeat: aiData.requiredEeat.slice(0, 5),
      requiredSchema: aiData.requiredSchema.slice(0, 5),
      internalLinkTargets: aiData.internalLinkTargets.slice(0, 5),
      aioPassageHints: aiData.aioPassageHints.slice(0, 5),
      topCompetitors: top.map((r) => ({
        position: r.position,
        domain: r.domain,
        title: r.title,
      })),
      paaQuestions: serp.paaQuestions.slice(0, 8),
      definitionOfDone: aiData.definitionOfDone,
    });
  }

  if (briefs.length === 0) {
    return {
      ok: false,
      error: "Couldn't fetch SERPs for any of your keywords. Try again.",
    };
  }
  await saveToolRun({
    toolId: "attack-briefs",
    label: `${briefs.length} brief${briefs.length === 1 ? "" : "s"}${competitorDomain ? ` vs ${competitorDomain}` : ""}`,
    input: { keywords, competitorDomain, country },
    result: { ok: true, briefs },
  }).catch(() => undefined);
  return { ok: true, briefs, aiFailure: lastAiFailure() };
}
