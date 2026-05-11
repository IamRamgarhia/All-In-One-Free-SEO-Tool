"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { getGscQuickWins, getGscTopQueries } from "@/lib/google-data";
import { callAI } from "@/lib/ai-call";
import { saveToolRun } from "@/lib/tool-runs";

/**
 * Content Attack Brief — port of seo-ops/content_attack_brief.
 *
 * Inputs: a client (must have GSC connected), days of look-back.
 * Algorithm:
 *   Impact (0-10) = log10(impressions) × 2 + funnel-weight(query) + trend
 *   Confidence (0-10) = position-based (closer to 1 = higher) +
 *                       CTR-vs-expected delta
 *   Priority = Impact × Confidence (max 100)
 * Output:
 *   Ranked BOFU money keywords, with AI-written "attack angle" for the
 *   top 10 — what content to ship, what to change on existing pages, why
 *   this beats the current SERP.
 *
 * Pure free-data version: no Ahrefs, no CPC. Uses GSC impressions as the
 * volume proxy and on-page heuristics for funnel stage.
 */

type AttackTarget = {
  query: string;
  position: number;
  impressions: number;
  clicks: number;
  ctr: number;
  impact: number;
  confidence: number;
  priority: number;
  funnel: "TOFU" | "MOFU" | "BOFU";
  reasoning: string[];
};

type AttackBrief = {
  query: string;
  priority: number;
  angle: string;
  contentType: string;
  targetURL: string | null;
  internalLinks: string[];
};

export type ContentAttackBriefState =
  | null
  | {
      ok: true;
      clientName: string;
      totalCandidates: number;
      targets: AttackTarget[];
      briefs: AttackBrief[];
      lookbackDays: number;
    }
  | { ok: false; error: string };

const BOFU_SIGNALS = [
  "pricing", "price", "cost", "buy", "vs", "review", "alternative",
  "comparison", "demo", "trial", "best", "top", "compare",
];
const MOFU_SIGNALS = [
  "how to", "guide", "tutorial", "checklist", "template", "example",
  "tools", "software", "platform", "service", "consultant",
];

function classifyFunnel(q: string): "TOFU" | "MOFU" | "BOFU" {
  const lc = q.toLowerCase();
  if (BOFU_SIGNALS.some((s) => lc.includes(s))) return "BOFU";
  if (MOFU_SIGNALS.some((s) => lc.includes(s))) return "MOFU";
  return "TOFU";
}

/** Expected CTR for a given Google position, very rough but useful as a baseline. */
function expectedCtr(position: number): number {
  if (position <= 1) return 0.32;
  if (position <= 2) return 0.18;
  if (position <= 3) return 0.11;
  if (position <= 5) return 0.07;
  if (position <= 10) return 0.03;
  if (position <= 20) return 0.01;
  return 0.005;
}

function calcImpact(impressions: number, funnel: "TOFU" | "MOFU" | "BOFU"): number {
  const volumeScore = Math.min(8, Math.log10(Math.max(1, impressions)) * 1.5);
  const funnelWeight = funnel === "BOFU" ? 2 : funnel === "MOFU" ? 1 : 0;
  return Math.min(10, volumeScore + funnelWeight);
}

function calcConfidence(position: number, ctr: number): number {
  // Closer to page-1 top = easier push. Plus a bonus if CTR is already
  // outperforming the position's baseline — signals strong relevance.
  const posScore = position <= 20 ? Math.max(0, 10 - position / 2) : 0;
  const ctrDelta = ctr - expectedCtr(position);
  const ctrBonus = ctrDelta > 0 ? Math.min(2, ctrDelta * 50) : 0;
  return Math.min(10, posScore + ctrBonus);
}

const SYSTEM = `You are an SEO content attack strategist. For each striking-distance keyword, write a 2-3 sentence "attack angle" — what specific content move would push it onto page 1. Focus on what beats the current SERP, not generic advice.

Output STRICT JSON (no preamble, no markdown fences):
{
  "briefs": [
    {
      "query": "<exact query>",
      "angle": "<2-3 sentences — specific move>",
      "contentType": "new post | refresh existing | landing page | comparison | listicle",
      "internalLinks": ["<source page slug>", ...]
    }
  ]
}`;

export async function runContentAttackBrief(
  _prev: ContentAttackBriefState,
  formData: FormData,
): Promise<ContentAttackBriefState> {
  const clientIdRaw = formData.get("clientId");
  if (!clientIdRaw) return { ok: false, error: "Pick a client." };
  const clientId = Number(clientIdRaw);
  const lookbackDays = Math.min(
    Math.max(Number(formData.get("days") ?? 28), 7),
    90,
  );

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found." };
  if (!client.gscProperty) {
    return {
      ok: false,
      error:
        "This client doesn't have Google Search Console connected. Connect GSC under Integrations first.",
    };
  }

  const [quickWins, topQueries] = await Promise.all([
    getGscQuickWins({ siteUrl: client.gscProperty, days: lookbackDays, limit: 40 }),
    getGscTopQueries({ siteUrl: client.gscProperty, days: lookbackDays, limit: 60 }),
  ]);

  // Combine + dedupe: quick wins are the priority, top queries fill in
  // anything else interesting (e.g. queries doing well but with room).
  const seen = new Set<string>();
  const pool: AttackTarget[] = [];
  for (const row of [...quickWins, ...topQueries]) {
    if (!row.query || seen.has(row.query)) continue;
    seen.add(row.query);
    const funnel = classifyFunnel(row.query);
    const impact = calcImpact(row.impressions, funnel);
    const confidence = calcConfidence(row.position, row.ctr);
    const priority = Math.round(impact * confidence);
    const reasoning: string[] = [];
    if (row.position >= 4 && row.position <= 15) {
      reasoning.push(`Striking distance — pos ${row.position.toFixed(1)}.`);
    }
    if (funnel === "BOFU") reasoning.push("BOFU intent — high commercial value.");
    if (row.impressions >= 1000) {
      reasoning.push(`${row.impressions.toLocaleString()} impressions — real demand.`);
    }
    if (row.ctr > expectedCtr(row.position) * 1.3) {
      reasoning.push("CTR beating its position — relevance is strong already.");
    }
    pool.push({
      query: row.query,
      position: row.position,
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      impact: Math.round(impact * 10) / 10,
      confidence: Math.round(confidence * 10) / 10,
      priority,
      funnel,
      reasoning,
    });
  }

  if (pool.length === 0) {
    return {
      ok: false,
      error:
        "No striking-distance keywords found in GSC for this period. Try a longer look-back, or wait for more data.",
    };
  }

  // Rank, take top targets, ask AI for attack angles on the top 10.
  const targets = pool.sort((a, b) => b.priority - a.priority).slice(0, 25);
  const topForAi = targets.slice(0, 10);

  const aiPrompt = `Site: ${client.url}\nLook-back: ${lookbackDays} days\n\nTop striking-distance queries:\n${topForAi
    .map(
      (t) =>
        `- "${t.query}" — pos ${t.position.toFixed(1)}, ${t.impressions.toLocaleString()} impr, ${t.funnel}, priority ${t.priority}`,
    )
    .join("\n")}\n\nWrite a concrete attack angle for each. Be specific to the query.`;

  const raw = await callAI({
    system: SYSTEM,
    user: aiPrompt,
    maxTokens: 1800,
    temperature: 0.4,
    feature: "content_idea",
    ignoreCreditSaver: true,
  });

  let briefs: AttackBrief[] = [];
  if (raw) {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    try {
      const parsed = JSON.parse(cleaned) as {
        briefs?: Array<{
          query: string;
          angle: string;
          contentType: string;
          internalLinks?: string[];
        }>;
      };
      briefs = (parsed.briefs ?? []).map((b) => ({
        query: b.query,
        priority:
          topForAi.find((t) => t.query === b.query)?.priority ?? 0,
        angle: b.angle,
        contentType: b.contentType,
        targetURL: null,
        internalLinks: b.internalLinks ?? [],
      }));
    } catch {
      // AI scoring is a bonus — the brief still works without it.
    }
  }

  await saveToolRun({
    toolId: "content-attack-brief",
    label: `${client.name} · ${targets.length} targets · ${briefs.length} briefs`,
    clientId,
    input: { clientId, lookbackDays },
    result: {
      ok: true,
      clientName: client.name,
      totalCandidates: pool.length,
      targets,
      briefs,
      lookbackDays,
    },
  }).catch(() => undefined);

  return {
    ok: true,
    clientName: client.name,
    totalCandidates: pool.length,
    targets,
    briefs,
    lookbackDays,
  };
}
