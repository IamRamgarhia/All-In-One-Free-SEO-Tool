"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { callAI, lastAiFailure } from "@/lib/ai-call";
import type { AiFailure } from "@/lib/ai-error";
import { saveToolRun } from "@/lib/tool-runs";
import {
  ADS_MASTER_SYSTEM_PROMPT,
  findAdPlatform,
  renderAdSkillContext,
  NICHE_LABELS,
  type AdPlatformId,
  type BusinessNiche,
  type FunnelStage,
} from "@/lib/ads-skills";
import {
  retrieveKnowledge,
  renderKnowledgeContext,
} from "@/lib/seo-knowledge-base";

export type AdsFunnelGoal =
  | "awareness"
  | "traffic"
  | "leads"
  | "sales"
  | "app_installs"
  | "engagement";

// ────────────────────────────────────────────────────────────────────
// Structured result shape — the AI returns this, and the UI renders it
// as a series of cards. Keep nullable everywhere the model might skip.
// ────────────────────────────────────────────────────────────────────

export type AdCopyVariant = {
  primaryText?: string;
  headlines: string[];
  descriptions?: string[];
  cta?: string;
  notes?: string;
};

export type PlatformOutput = {
  platformId: AdPlatformId;
  platformName: string;
  /** TOFU/MOFU/BOFU intent for this platform in the recommended mix. */
  funnelStage: FunnelStage;
  /** Why this platform fits this business. */
  rationale: string;
  /** Multiple variants — campaigns ship with 3-5 to let the algo test. */
  copyVariants: AdCopyVariant[];
  /** Image-generation prompts ready for MidJourney / DALL-E / SD. */
  imagePrompts: string[];
  /** For Google Search only — keyword bundle by match type. */
  keywords?: {
    exact: string[];
    phrase: string[];
    broad: string[];
    negatives: string[];
  };
  /** Realistic budget floor for this platform in this strategy. */
  monthlyBudgetSuggestion: string;
  /** Per-platform tracking + conversion event setup notes. */
  trackingNotes: string[];
  /** What the user must NOT do on this platform. */
  pitfallsToAvoid: string[];
};

export type FunnelMap = {
  stage: FunnelStage;
  platforms: AdPlatformId[];
  whatToOffer: string;
  successMetric: string;
};

export type AdsFunnelResult = {
  /** 2-3 paragraph strategy summary tying it all together. */
  strategySummary: string;
  /** Total recommended monthly spend with the split per platform. */
  budgetTotal: string;
  budgetSplit: { platformId: AdPlatformId; share: number; amount: string }[];
  /** Funnel map: which stages get which platforms. */
  funnelMap: FunnelMap[];
  /** Per-platform output. */
  platforms: PlatformOutput[];
  /** UTM convention + analytics setup. */
  trackingPlaybook: string[];
  /** Things to set up BEFORE launching (pixel, conversions API, etc.). */
  preflightChecklist: string[];
};

export type AdsFunnelState =
  | { ok: true; result: AdsFunnelResult; runId: number; aiFailure?: AiFailure | null }
  | { ok: false; error: string };

// ────────────────────────────────────────────────────────────────────
// Action
// ────────────────────────────────────────────────────────────────────

export async function generateAdsFunnel(
  _prev: AdsFunnelState | null,
  formData: FormData,
): Promise<AdsFunnelState> {
  const clientIdRaw = formData.get("clientId");
  const clientId = clientIdRaw ? Number(clientIdRaw) : null;
  const platformIdsRaw = formData.getAll("platforms") as string[];
  const platformIds = platformIdsRaw.filter(
    (p): p is AdPlatformId => findAdPlatform(p) !== null,
  );
  const niche = (String(formData.get("niche") ?? "").trim() ||
    null) as BusinessNiche | null;
  const goal = (String(formData.get("goal") ?? "leads") ||
    "leads") as AdsFunnelGoal;
  const monthlyBudgetUsd = Math.max(
    100,
    Number(formData.get("monthlyBudgetUsd") ?? 1000),
  );
  const audience = String(formData.get("audience") ?? "").slice(0, 600);
  const offer = String(formData.get("offer") ?? "").slice(0, 600);
  const landingUrl = String(formData.get("landingUrl") ?? "").slice(0, 300);
  const productName = String(formData.get("productName") ?? "").slice(0, 200);

  if (platformIds.length === 0) {
    return { ok: false, error: "Pick at least one platform." };
  }
  if (!productName && !landingUrl && !clientId) {
    return {
      ok: false,
      error: "Tell us what you're advertising — product/service name or landing URL or a connected client.",
    };
  }

  // Pull client context if a client is attached. The AI uses this to
  // tailor every piece of output. Mirrors the daily-automations pattern.
  let clientContext = "";
  let resolvedNiche = niche;
  if (clientId) {
    const [c] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (c) {
      const lines: string[] = [`[Client context]`];
      lines.push(`- Name: ${c.name}`);
      lines.push(`- Site: ${c.url}`);
      if (c.niche) {
        lines.push(`- Niche: ${c.niche}`);
        if (!resolvedNiche) resolvedNiche = c.niche as BusinessNiche;
      }
      if (c.techStack && c.techStack.length > 0) {
        lines.push(`- Tech stack: ${c.techStack.join(", ")}`);
      }
      clientContext = lines.join("\n");
    }
  }

  const skillContext = renderAdSkillContext({
    platformIds,
    niche: resolvedNiche,
  });

  // Pull knowledge corpus chunks for any platform-related queries. The
  // SEO knowledge base has chunks on conversion best practices, landing
  // page rules, etc. that overlap with paid-ads landing pages.
  const kbQuery = `${productName || "ads"} ${platformIds.join(" ")} landing page conversion`;
  const matched = retrieveKnowledge(kbQuery, 2);
  const kbContext = renderKnowledgeContext(matched, 1800);

  // Compose the assembled system prompt
  const system = [
    ADS_MASTER_SYSTEM_PROMPT,
    "",
    skillContext,
    "",
    clientContext,
    kbContext
      ? `\n[Relevant knowledge — weave in, don't quote]\n${kbContext}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = buildUserPrompt({
    productName,
    landingUrl,
    audience,
    offer,
    goal,
    monthlyBudgetUsd,
    platformIds,
    niche: resolvedNiche,
  });

  const raw = await callAI({
    system,
    user,
    maxTokens: 5000,
    temperature: 0.6,
    timeoutMs: 180_000,
    ignoreCreditSaver: true,
    feature: "general",
    clientId,
  });
  if (!raw) {
    return {
      ok: false,
      error:
        "AI provider didn't respond. Check Settings → AI provider and confirm a key is configured.",
    };
  }

  const parsed = parseAdsFunnel(raw, platformIds);
  if (!parsed) {
    return {
      ok: false,
      error:
        "AI returned a response we couldn't parse as JSON. Try again, or shorten your inputs.",
    };
  }

  // Persist for the recent-runs feed
  let runId = 0;
  try {
    runId = await saveToolRun({
      toolId: "ads-funnel",
      label: `${platformIds.join(" + ")}${productName ? ` · ${productName}` : ""} · $${monthlyBudgetUsd}/mo`,
      clientId,
      input: {
        platformIds,
        niche: resolvedNiche,
        goal,
        monthlyBudgetUsd,
        audience,
        offer,
        landingUrl,
        productName,
      },
      result: parsed,
    });
  } catch {
    // ignore — not load-bearing
  }

  return { ok: true, result: parsed, runId, aiFailure: lastAiFailure() };
}

// ────────────────────────────────────────────────────────────────────
// Prompt assembly
// ────────────────────────────────────────────────────────────────────

function buildUserPrompt(opts: {
  productName: string;
  landingUrl: string;
  audience: string;
  offer: string;
  goal: AdsFunnelGoal;
  monthlyBudgetUsd: number;
  platformIds: AdPlatformId[];
  niche: BusinessNiche | null;
}): string {
  const platforms = opts.platformIds
    .map((id) => findAdPlatform(id)?.name ?? id)
    .join(", ");

  return `Generate a complete ad-funnel strategy. Output STRICT JSON only — no markdown fences, no preamble, no commentary.

[Brief]
- Product / service: ${opts.productName || "(see landing URL)"}
- Landing URL: ${opts.landingUrl || "(none provided — recommend one)"}
- Primary goal: ${opts.goal}
- Monthly budget: $${opts.monthlyBudgetUsd}
- Platforms in scope: ${platforms}
- Niche: ${opts.niche ? NICHE_LABELS[opts.niche] : "(not specified)"}
- Audience description: ${opts.audience || "(infer from product + niche)"}
- Offer / hook: ${opts.offer || "(infer)"}

Output schema (every field required):

{
  "strategySummary": "2-3 paragraph strategy tying platforms + funnel + budget together. Tell the user the WHY behind the platform mix.",
  "budgetTotal": "$1,000/mo",
  "budgetSplit": [
    { "platformId": "meta", "share": 50, "amount": "$500" },
    { "platformId": "google_search", "share": 50, "amount": "$500" }
  ],
  "funnelMap": [
    {
      "stage": "awareness" | "consideration" | "conversion" | "retention",
      "platforms": ["meta"],
      "whatToOffer": "What the offer / creative looks like at this stage",
      "successMetric": "What you measure to know it's working"
    }
  ],
  "platforms": [
    {
      "platformId": "meta",
      "platformName": "Meta (Facebook + Instagram)",
      "funnelStage": "consideration",
      "rationale": "Why this platform for THIS business",
      "copyVariants": [
        {
          "primaryText": "≤platform's primary text limit",
          "headlines": ["≤30 chars", "≤30 chars", ...],
          "descriptions": ["≤30 chars", ...],
          "cta": "Learn More",
          "notes": "Optional usage note"
        },
        ...3-5 variants per platform
      ],
      "imagePrompts": [
        "MidJourney/DALL-E-ready prompt: subject, composition, lighting, style, aspect ratio. 3-5 prompts."
      ],
      "keywords": {
        "exact": ["[exact keyword]"],
        "phrase": ["\\"phrase match\\""],
        "broad": ["broad keyword"],
        "negatives": ["-free", "-torrent"]
      },
      "monthlyBudgetSuggestion": "$500/mo with 30-day learning phase reserve",
      "trackingNotes": ["Set up Conversions API for offline event sync"],
      "pitfallsToAvoid": ["Don't pin all 15 headlines"]
    }
  ],
  "trackingPlaybook": [
    "UTM convention: utm_source={platform}, utm_medium=cpc, utm_campaign={campaign-id}, utm_content={ad-variant}",
    "Primary conversion: lead form submission",
    "Secondary conversions: trial start, demo booked, ..."
  ],
  "preflightChecklist": [
    "Install Meta Pixel + Conversions API on landing page",
    "Verify domain on Meta Business",
    ...
  ]
}

Important rules:
- ONLY include "keywords" for "google_search" platforms. Omit for all others.
- Respect character limits per platform (encoded in the system context above). Headlines + descriptions for Google Search are particularly tight — 30 chars / 90 chars exactly.
- Budget split percentages must sum to 100.
- Image prompts should be SPECIFIC: "vertical 9:16 photograph, mid-shot of a professional woman in her 30s holding a phone with the [app] dashboard visible, natural window light from the left, modern home office background slightly blurred, photographic realism" — not "image of a happy customer".
- For platforms with no image (google_search), omit imagePrompts entirely or return [].
- Be honest. If a platform won't work at this budget, say so in the rationale and reduce its budget share or recommend dropping it.`;
}

// ────────────────────────────────────────────────────────────────────
// Response parsing
// ────────────────────────────────────────────────────────────────────

function parseAdsFunnel(
  raw: string,
  expectedPlatformIds: AdPlatformId[],
): AdsFunnelResult | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      json = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (typeof json !== "object" || json === null) return null;
  const j = json as Record<string, unknown>;

  // Defensive normalization — the model occasionally returns minor schema
  // variations. We fill missing fields rather than reject.
  const result: AdsFunnelResult = {
    strategySummary: stringOr(j.strategySummary, ""),
    budgetTotal: stringOr(j.budgetTotal, ""),
    budgetSplit: arrayOr(j.budgetSplit).map((b) => {
      const r = b as Record<string, unknown>;
      return {
        platformId: stringOr(r.platformId, "") as AdPlatformId,
        share: typeof r.share === "number" ? r.share : Number(r.share ?? 0),
        amount: stringOr(r.amount, ""),
      };
    }),
    funnelMap: arrayOr(j.funnelMap).map((f) => {
      const r = f as Record<string, unknown>;
      return {
        stage: (stringOr(r.stage, "consideration") as FunnelStage),
        platforms: arrayOr(r.platforms).map((p) => p as AdPlatformId),
        whatToOffer: stringOr(r.whatToOffer, ""),
        successMetric: stringOr(r.successMetric, ""),
      };
    }),
    platforms: arrayOr(j.platforms).map((p) => {
      const r = p as Record<string, unknown>;
      const platformId = stringOr(r.platformId, "") as AdPlatformId;
      const meta = findAdPlatform(platformId);
      return {
        platformId,
        platformName: stringOr(r.platformName, meta?.name ?? platformId),
        funnelStage: (stringOr(r.funnelStage, "consideration") as FunnelStage),
        rationale: stringOr(r.rationale, ""),
        copyVariants: arrayOr(r.copyVariants).map((v) => {
          const vr = v as Record<string, unknown>;
          return {
            primaryText: optionalString(vr.primaryText),
            headlines: arrayOr(vr.headlines).map((h) => String(h)),
            descriptions: arrayOr(vr.descriptions).map((d) => String(d)),
            cta: optionalString(vr.cta),
            notes: optionalString(vr.notes),
          };
        }),
        imagePrompts: arrayOr(r.imagePrompts).map((i) => String(i)),
        keywords:
          r.keywords && typeof r.keywords === "object"
            ? {
                exact: arrayOr(
                  (r.keywords as Record<string, unknown>).exact,
                ).map(String),
                phrase: arrayOr(
                  (r.keywords as Record<string, unknown>).phrase,
                ).map(String),
                broad: arrayOr(
                  (r.keywords as Record<string, unknown>).broad,
                ).map(String),
                negatives: arrayOr(
                  (r.keywords as Record<string, unknown>).negatives,
                ).map(String),
              }
            : undefined,
        monthlyBudgetSuggestion: stringOr(r.monthlyBudgetSuggestion, ""),
        trackingNotes: arrayOr(r.trackingNotes).map(String),
        pitfallsToAvoid: arrayOr(r.pitfallsToAvoid).map(String),
      };
    }),
    trackingPlaybook: arrayOr(j.trackingPlaybook).map(String),
    preflightChecklist: arrayOr(j.preflightChecklist).map(String),
  };

  // Sanity check — must have at least one platform output
  if (result.platforms.length === 0) return null;

  // Backfill any expected platform the AI dropped
  for (const id of expectedPlatformIds) {
    if (!result.platforms.find((p) => p.platformId === id)) {
      const meta = findAdPlatform(id);
      if (!meta) continue;
      result.platforms.push({
        platformId: id,
        platformName: meta.name,
        funnelStage: meta.effectiveFunnelStages[0] ?? "consideration",
        rationale: "(AI omitted this platform — re-run to get full coverage)",
        copyVariants: [],
        imagePrompts: [],
        monthlyBudgetSuggestion: meta.costBenchmarks.minMonthlyBudget,
        trackingNotes: [],
        pitfallsToAvoid: meta.pitfalls,
      });
    }
  }

  return result;
}

function stringOr(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}
function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function arrayOr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

