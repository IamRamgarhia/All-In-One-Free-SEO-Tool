/**
 * GEO SWOT generator.
 *
 * Otterly's premium "GEO Audit" produces a SWOT specifically for AI
 * visibility — Strengths, Weaknesses, Opportunities, Threats. We
 * produce the same shape locally via the user's already-configured
 * LLM, so it works free on Gemini / Groq.
 *
 * Inputs (deterministic, computed from existing tables):
 *   - The client's AI visibility checks (which providers mention them,
 *     how often, what sentiment)
 *   - The competitor set (rows in `competitors` for this client)
 *   - For each competitor: how often THEY get cited on the same
 *     prompts (via running fresh AI checks on competitor domains)
 *
 * Output:
 *   {
 *     strengths: string[],     // 3-5 bullets — what you do well in AI answers
 *     weaknesses: string[],    // 3-5 bullets — where you lose to competitors
 *     opportunities: string[], // 3-5 bullets — prompts where nobody owns the answer
 *     threats: string[],       // 3-5 bullets — risks (competitor momentum etc.)
 *     summary: string,         // 2-3 sentence top-line
 *     dataPoints: ExecSummaryDataPoint[]  // cite-or-bust evidence
 *   }
 *
 * Same cite-or-bust pattern as the exec summary: every claim in the
 * prose maps to a deterministic data point so the user can verify.
 *
 * Free-first: no paid API. Uses callAI which routes through the
 * user's chosen provider (any free tier works).
 */

import { and, eq, desc, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { aiVisibilityChecks, competitors, keywords, clients } from "@/db/schema";
import { callAI } from "./ai-call";
import type { ExecSummaryDataPoint } from "./ai-summary";

export type GeoSwot = {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  summary: string;
  dataPoints: ExecSummaryDataPoint[];
  source: "ai" | "template";
};

const SYSTEM_PROMPT = `You write GEO (Generative Engine Optimization) SWOT analyses for SEO clients.

Strict output format — return ONLY valid JSON, no prose before/after:
{
  "strengths": ["..."],    // 3-5 short bullets, each <= 20 words
  "weaknesses": ["..."],   // 3-5 short bullets, each <= 20 words
  "opportunities": ["..."],// 3-5 short bullets, each <= 20 words
  "threats": ["..."],      // 3-5 short bullets, each <= 20 words
  "summary": "..."         // 2-3 sentences, plain language
}

Rules:
- Ground every bullet in the numbers the user gives you. Don't invent stats.
- "Opportunities" are prompts where NO competitor was cited well — there's an open slot to grab.
- "Threats" are competitors gaining momentum OR prompts where AI describes the client negatively.
- Plain language. No marketing fluff. Direct, factual, actionable.`;

export async function generateGeoSwot(input: {
  clientId: number;
  /** Last N days of AI visibility checks to consider. Defaults to 30. */
  windowDays?: number;
  /** Language of the text shown to the reader. "fr" writes it in French. */
  locale?: string;
}): Promise<GeoSwot> {
  const windowDays = input.windowDays ?? 30;
  const fr = input.locale === "fr";
  const since = new Date(Date.now() - windowDays * 86_400_000);

  // 1. Client info
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, input.clientId))
    .limit(1);
  if (!client) {
    return emptySwot(fr ? "client introuvable" : "Client not found", fr);
  }

  // 2. Aggregate AI visibility for this client's keywords over the window.
  const checks = await db
    .select({
      provider: aiVisibilityChecks.provider,
      mentionsDomain: aiVisibilityChecks.mentionsDomain,
      citationsForDomain: aiVisibilityChecks.citationsForDomain,
      sentiment: aiVisibilityChecks.sentiment,
      sentimentScore: aiVisibilityChecks.sentimentScore,
    })
    .from(aiVisibilityChecks)
    .innerJoin(keywords, eq(aiVisibilityChecks.keywordId, keywords.id))
    .where(
      and(
        eq(keywords.clientId, input.clientId),
        gte(aiVisibilityChecks.checkedAt, since),
      ),
    )
    .orderBy(desc(aiVisibilityChecks.checkedAt))
    .limit(500);

  // 3. Competitor list (no fresh AI calls for them — we just list them
  //    so the LLM can reference the set; the user can run separate AI
  //    checks per competitor via /ai-visibility if they want deeper data).
  const comps = await db
    .select({ name: competitors.name, url: competitors.url })
    .from(competitors)
    .where(eq(competitors.clientId, input.clientId))
    .limit(20);

  // 4. Compute the deterministic data points (cite-or-bust evidence)
  const totalChecks = checks.length;
  const mentionCount = checks.filter((c) => c.mentionsDomain).length;
  const mentionRate =
    totalChecks > 0
      ? Math.round((mentionCount / totalChecks) * 100)
      : 0;
  const avgSentiment =
    checks.filter((c) => c.sentimentScore !== null).reduce(
      (s, c) => s + (c.sentimentScore ?? 0),
      0,
    ) / Math.max(1, checks.filter((c) => c.sentimentScore !== null).length);

  const sentimentLabel =
    avgSentiment > 30
      ? "positive"
      : avgSentiment < -30
        ? "negative"
        : "neutral";

  const byProvider = new Map<string, { mentions: number; total: number }>();
  for (const c of checks) {
    const cur = byProvider.get(c.provider) ?? { mentions: 0, total: 0 };
    cur.total += 1;
    if (c.mentionsDomain) cur.mentions += 1;
    byProvider.set(c.provider, cur);
  }
  const providerLine = Array.from(byProvider.entries())
    .map(([p, v]) => `${p}: ${v.mentions}/${v.total}`)
    .join(" · ");

  const sentimentFr = { positive: "positif", negative: "négatif", neutral: "neutre" }[sentimentLabel];
  const dataPoints: ExecSummaryDataPoint[] = [
    { label: "Client", value: `${client.name} (${client.url})` },
    {
      label: fr ? "Période" : "Window",
      value: fr ? `${windowDays} derniers jours` : `last ${windowDays} days`,
    },
    { label: fr ? "Vérifications IA lancées" : "AI checks run", value: String(totalChecks) },
    {
      label: fr ? "Taux de mention" : "Mention rate",
      value: fr
        ? `${mentionRate} % (${mentionCount}/${totalChecks})`
        : `${mentionRate}% (${mentionCount}/${totalChecks})`,
    },
  ];
  if (providerLine) {
    dataPoints.push({ label: fr ? "Mentions par fournisseur" : "Mentions by provider", value: providerLine });
  }
  if (Number.isFinite(avgSentiment) && totalChecks > 0) {
    dataPoints.push({
      label: fr ? "Ton moyen" : "Avg sentiment",
      value: fr
        ? `${sentimentFr} (${Math.round(avgSentiment)} sur une échelle de -100 à +100)`
        : `${sentimentLabel} (${Math.round(avgSentiment)} on -100..+100)`,
    });
  }
  if (comps.length > 0) {
    dataPoints.push({
      label: fr ? "Concurrents suivis" : "Tracked competitors",
      value: comps.map((c) => c.name).slice(0, 10).join(", "),
    });
  }

  // 5. Ask the LLM to produce the SWOT, grounded in the numbers
  const promptLines: string[] = [];
  promptLines.push(`Client: ${client.name} (${client.url})`);
  promptLines.push(`AI visibility window: last ${windowDays} days, ${totalChecks} checks across ${byProvider.size} providers.`);
  promptLines.push(`Brand mention rate: ${mentionRate}% (${mentionCount} of ${totalChecks}).`);
  if (providerLine) promptLines.push(`Per-provider: ${providerLine}.`);
  if (Number.isFinite(avgSentiment) && mentionCount > 0) {
    promptLines.push(
      `Average mention sentiment: ${sentimentLabel} (${Math.round(avgSentiment)} on -100..+100 scale).`,
    );
  }
  if (comps.length > 0) {
    promptLines.push(
      `Tracked competitors: ${comps.map((c) => `${c.name} (${c.url})`).join("; ")}.`,
    );
  } else {
    promptLines.push(
      `No competitors tracked yet — recommend adding 3-5 in the SWOT.`,
    );
  }
  promptLines.push("");
  promptLines.push(
    fr
      ? "Write the SWOT. Write every bullet and the summary in French, addressing the reader as \"vous\". Return ONLY the JSON object."
      : "Write the SWOT. Return ONLY the JSON object.",
  );

  const raw = await callAI({
    system: SYSTEM_PROMPT,
    user: promptLines.join("\n"),
    maxTokens: 1200,
    temperature: 0.3,
    timeoutMs: 45_000,
    feature: "geo_swot",
    clientId: input.clientId,
    ignoreCreditSaver: true,
  });

  if (!raw) {
    return { ...templateSwot(mentionRate, sentimentLabel, comps.length, fr), dataPoints, source: "template" };
  }
  const parsed = parseSwot(raw);
  if (!parsed) {
    return { ...templateSwot(mentionRate, sentimentLabel, comps.length, fr), dataPoints, source: "template" };
  }
  return { ...parsed, dataPoints, source: "ai" };
}

function emptySwot(reason: string, fr = false): GeoSwot {
  if (fr) {
    return {
      strengths: [],
      weaknesses: [`SWOT indisponible : ${reason}`],
      opportunities: [],
      threats: [],
      summary: `Le SWOT n’a pas pu être généré : ${reason}.`,
      dataPoints: [],
      source: "template",
    };
  }
  return {
    strengths: [],
    weaknesses: [`SWOT unavailable: ${reason}`],
    opportunities: [],
    threats: [],
    summary: `SWOT could not be generated: ${reason}.`,
    dataPoints: [],
    source: "template",
  };
}

function parseSwot(raw: string): Omit<GeoSwot, "dataPoints" | "source"> | null {
  const trimmed = raw.trim();
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
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const toStringArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 8) : [];
  return {
    strengths: toStringArr(o.strengths),
    weaknesses: toStringArr(o.weaknesses),
    opportunities: toStringArr(o.opportunities),
    threats: toStringArr(o.threats),
    summary: typeof o.summary === "string" ? o.summary.slice(0, 600) : "",
  };
}

function templateSwot(
  mentionRate: number,
  sentimentLabel: string,
  competitorCount: number,
  fr = false,
): Omit<GeoSwot, "dataPoints" | "source"> {
  if (fr) return templateSwotFr(mentionRate, sentimentLabel, competitorCount);
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  if (mentionRate >= 60) {
    strengths.push(`Strong baseline AI visibility — cited in ${mentionRate}% of tracked prompts.`);
  } else if (mentionRate > 0) {
    weaknesses.push(`AI visibility is thin — cited in only ${mentionRate}% of tracked prompts.`);
  } else {
    weaknesses.push("No AI mentions detected in the window — brand isn't on the LLM radar yet.");
    opportunities.push("Zero current AI presence means every prompt is an open slot to claim.");
  }

  if (sentimentLabel === "positive") {
    strengths.push("AI mentions skew positive — protect this with brand-consistent content.");
  } else if (sentimentLabel === "negative") {
    threats.push("AI mentions skew negative — investigate the source pages LLMs are citing.");
  }

  if (competitorCount === 0) {
    weaknesses.push("No competitors tracked — add 3-5 in the Competitors section for sharper SWOT.");
    opportunities.push("Add competitors to discover prompts where rivals own answers you should compete for.");
  } else {
    opportunities.push(
      `Run AI visibility checks against the ${competitorCount} tracked competitors to find content gaps.`,
    );
  }

  return {
    strengths,
    weaknesses,
    opportunities,
    threats,
    summary:
      "AI summary unavailable (no API provider configured). The data points below show the underlying state — connect a free Gemini or Groq key for a written SWOT.",
  };
}

/** The fallback SWOT in French. Same rules as templateSwot. */
function templateSwotFr(
  mentionRate: number,
  sentimentLabel: string,
  competitorCount: number,
): Omit<GeoSwot, "dataPoints" | "source"> {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const opportunities: string[] = [];
  const threats: string[] = [];

  if (mentionRate >= 60) {
    strengths.push(`Bonne visibilité de base dans les IA : citée dans ${mentionRate} % des requêtes suivies.`);
  } else if (mentionRate > 0) {
    weaknesses.push(`Visibilité faible dans les IA : citée dans seulement ${mentionRate} % des requêtes suivies.`);
  } else {
    weaknesses.push("Aucune mention dans les IA sur la période : la marque n’apparaît pas encore dans leurs réponses.");
    opportunities.push("Aucune présence actuelle dans les IA : chaque requête est une place à prendre.");
  }

  if (sentimentLabel === "positive") {
    strengths.push("Les mentions dans les IA sont plutôt positives : entretenez-les avec un contenu cohérent avec la marque.");
  } else if (sentimentLabel === "negative") {
    threats.push("Les mentions dans les IA sont plutôt négatives : examinez les pages sources que les IA citent.");
  }

  if (competitorCount === 0) {
    weaknesses.push("Aucun concurrent suivi : ajoutez-en quelques-uns dans la section Concurrents pour un SWOT plus précis.");
    opportunities.push("Ajoutez des concurrents pour repérer les requêtes où ils occupent des réponses que vous pourriez leur disputer.");
  } else {
    opportunities.push(
      `Lancez des vérifications de visibilité IA sur ${competitorCount === 1 ? "le concurrent suivi" : `les ${competitorCount} concurrents suivis`} pour repérer les manques de contenu.`,
    );
  }

  return {
    strengths,
    weaknesses,
    opportunities,
    threats,
    summary:
      "Résumé IA indisponible : le fournisseur d’IA n’a pas répondu. Les données ci-dessous montrent la situation ; un SWOT rédigé demande un fournisseur d’IA qui répond (Gemini et Groq proposent une offre gratuite).",
  };
}
