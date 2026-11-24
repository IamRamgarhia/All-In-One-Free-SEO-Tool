/**
 * Niche-aware backlink prospect matching.
 *
 * Two layers:
 *   1) Score every row in seoResources for a given client and return the
 *      top-N. Pure deterministic — runs in a few ms, no AI cost.
 *   2) Optional AI top-up: ask the model for ~10 bespoke ideas tuned to the
 *      client's specific business (e.g. "local bakery in Austin" → list of
 *      Austin food blogs, food podcasts, baking forums).
 *
 * The deterministic layer alone is enough to be useful even without AI keys.
 */

import { and, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { seoResources, type SeoResource } from "@/db/schema";
import { callAI } from "./ai-call";
import { deriveDifficulty, type Difficulty } from "./backlink-difficulty";

export type ScoredProspect = {
  resource: SeoResource;
  score: number;
  difficulty: Difficulty;
  reason: string;
};

export type NicheBacklinkInput = {
  niche: string | null;
  city: string | null;
  country: string | null;
  businessType: string | null;
  description: string | null;
};

/** Niche → preferred categories (higher weight). */
const CATEGORY_FIT: Record<string, string[]> = {
  local: [
    "local-citation",
    "directory-submission",
    "business-networking",
    "social-networking",
    "social-bookmarking",
  ],
  ecommerce: [
    "image-submission",
    "video-sharing",
    "social-bookmarking",
    "directory-submission",
    "classified-submission",
    "showcase",
  ],
  saas: [
    "blog-submission",
    "showcase",
    "directory-submission",
    "business-networking",
    "forum-posting",
    "web-2.0",
  ],
  blog: [
    "blog-submission",
    "rss-feed",
    "web-2.0",
    "article-submission",
    "social-bookmarking",
    "story-sharing",
  ],
  services: [
    "directory-submission",
    "local-citation",
    "business-networking",
    "blog-submission",
    "profile-creation",
  ],
};

/**
 * Score every resource for a client. Higher score = better fit.
 *
 * Score components:
 *   - Niche-fit category bonus (0-30)
 *   - DA contribution (0-50, capped at DA 100)
 *   - Diversity penalty if user already tracks the same category many times
 *     (handled by caller, not here)
 */
export async function scoreNicheProspects(
  input: NicheBacklinkInput,
  limit = 60,
  /** Language of the reason line shown next to each prospect. */
  locale = "en",
): Promise<ScoredProspect[]> {
  const all = await db
    .select()
    .from(seoResources)
    .where(and())
    .orderBy(desc(seoResources.da));

  const fitCategories = input.niche ? CATEGORY_FIT[input.niche] ?? [] : [];

  const scored: ScoredProspect[] = all.map((r) => {
    let score = 0;
    if (fitCategories.includes(r.category)) score += 30;
    if (typeof r.da === "number") {
      score += Math.min(50, Math.max(0, r.da / 2));
    }
    const difficulty = deriveDifficulty(r.category, r.da);
    // Slight bonus for the long-tail of accessible-but-decent: easy + DA40+ wins
    if (difficulty === "easy" && (r.da ?? 0) >= 40) score += 5;
    if (difficulty === "medium" && (r.da ?? 0) >= 50) score += 8;
    if (difficulty === "hard" && (r.da ?? 0) >= 70) score += 12;
    return {
      resource: r,
      score,
      difficulty,
      reason: explainFit(r.category, difficulty, fitCategories, locale === "fr"),
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function explainFit(
  category: string,
  difficulty: Difficulty,
  fitCategories: string[],
  fr = false,
): string {
  if (fr) {
    // Effort only: the English "ranking weight" is an estimate with no
    // source behind it, so the French leaves it out.
    const nicheFr = fitCategories.includes(category)
      ? "correspond à votre niche"
      : "base SEO générale";
    if (difficulty === "easy") return `${nicheFr} · peu d’effort pour l’obtenir`;
    if (difficulty === "medium") return `${nicheFr} · modération à passer`;
    if (difficulty === "hard") return `${nicheFr} · exigence éditoriale élevée`;
    return `${nicheFr} · souvent payant : vérifiez le coût`;
  }
  const niche = fitCategories.includes(category)
    ? "matches your niche"
    : "general SEO foundation";
  if (difficulty === "easy") return `${niche} · low effort to claim`;
  if (difficulty === "medium")
    return `${niche} · moderate moderation, decent ranking weight`;
  if (difficulty === "hard")
    return `${niche} · high editorial bar, strong ranking weight`;
  return `${niche} · usually paid — confirm cost`;
}

/**
 * AI-generated bespoke ideas. Returns up to 10 prospect suggestions tuned
 * to the client's specific business and city. Costs a single AI call.
 *
 * Falls back to [] if no AI provider is configured.
 */
export async function aiBespokeBacklinkIdeas(
  input: NicheBacklinkInput,
  clientName: string,
): Promise<AiBacklinkIdea[]> {
  const facts = [
    `Business: ${clientName}`,
    input.businessType ? `Type: ${input.businessType}` : null,
    input.niche ? `Niche bucket: ${input.niche}` : null,
    input.city ? `City: ${input.city}` : null,
    input.country ? `Country: ${input.country}` : null,
    input.description ? `Description: ${input.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const system = `You suggest backlink prospects an SEO would actually pursue. Output a JSON array (no commentary) of up to 10 items. Each item has:
- "name": the site/community/podcast/directory name
- "url": homepage or submission URL (use https://, your best guess if unsure)
- "type": one of "directory" | "podcast" | "community" | "blog" | "newsletter" | "association" | "review_site" | "forum" | "tool_marketplace" | "course_marketplace"
- "difficulty": "easy" | "medium" | "hard" | "paid"
- "rationale": one sentence on why this fits
- "actionStep": one sentence on the very first step (e.g. "submit your URL via /add", "pitch episode topic via the booking form")

Rules:
- Be specific to the business — niche directories and communities, not generic ones already in our DB
- Include a mix of difficulties
- Skip anything paid unless it's clearly worth it
- For local businesses, include local press, neighborhood blogs, chambers of commerce
- Never invent obviously fake URLs — if uncertain, use the homepage`;

  const user = `Suggest backlink prospects for:\n${facts}\n\nReturn ONLY the JSON array.`;

  const text = await callAI({
    system,
    user,
    maxTokens: 1200,
    temperature: 0.5,
    feature: "general",
    timeoutMs: 60_000,
  });
  if (!text) return [];

  // Defensive: extract first JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is AiBacklinkIdea => {
        if (!p || typeof p !== "object") return false;
        const o = p as Record<string, unknown>;
        return typeof o.name === "string" && typeof o.url === "string";
      })
      .slice(0, 10)
      .map((p) => ({
        name: String(p.name).slice(0, 120),
        url: String(p.url).slice(0, 240),
        type: (p.type as AiBacklinkIdea["type"]) ?? "blog",
        difficulty: (p.difficulty as Difficulty) ?? "medium",
        rationale: String(p.rationale ?? "").slice(0, 240),
        actionStep: String(p.actionStep ?? "").slice(0, 240),
      }));
  } catch {
    return [];
  }
}

export type AiBacklinkIdea = {
  name: string;
  url: string;
  type:
    | "directory"
    | "podcast"
    | "community"
    | "blog"
    | "newsletter"
    | "association"
    | "review_site"
    | "forum"
    | "tool_marketplace"
    | "course_marketplace";
  difficulty: Difficulty;
  rationale: string;
  actionStep: string;
};
