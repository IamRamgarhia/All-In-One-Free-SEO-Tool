/**
 * Tiny AI content helpers that don't need their own page-tool weight:
 *   - generateCoverImagePrompts: 3 image-gen prompts (Stable Diffusion /
 *     Midjourney / DALL-E friendly) for a blog/post cover image.
 *   - suggestCategoriesAndTags: site-aware category + tag suggestions for
 *     a piece of content.
 *
 * These hand off to whichever AI provider is configured.
 */

import { callAI, lastAiFailure } from "./ai-call";

const IMAGE_PROMPT_SYSTEM = `You write image-generation prompts for blog post / landing page cover images. Each prompt should:
- Describe a clear, single composition. No multiple separate scenes.
- Open with the subject and the primary action / state.
- Specify style ("editorial illustration", "isometric 3D render", "soft watercolor", "moody photo with shallow depth of field", "minimal flat-design vector").
- Specify mood + lighting ("warm golden-hour light", "cool studio lighting", "dramatic chiaroscuro").
- Include aspect ratio at the end ("--ar 16:9" friendly).
- ≤45 words each.
- DO NOT include the post title verbatim — describe imagery, not topics.

Output JSON only — an array of 3 objects:
[{ "style": "<short style name>", "prompt": "<full image prompt>" }, ...]`;

export type ImagePromptIdea = {
  style: string;
  prompt: string;
};

export type ImagePromptResult =
  | { ok: true; prompts: ImagePromptIdea[] }
  | { ok: false; error: string };

export async function generateCoverImagePrompts(opts: {
  title: string;
  brief?: string;
  niche?: string | null;
  clientId?: number | null;
}): Promise<ImagePromptResult> {
  if (!opts.title.trim()) {
    return { ok: false, error: "Post title required." };
  }

  const userPrompt = [
    `Post title: ${opts.title}`,
    opts.brief ? `Brief / angle: ${opts.brief.slice(0, 400)}` : "",
    opts.niche ? `Niche: ${opts.niche}` : "",
    "",
    "Output 3 cover-image prompts in 3 distinct visual styles. JSON array only.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callAI({
    system: IMAGE_PROMPT_SYSTEM,
    user: userPrompt,
    maxTokens: 600,
    temperature: 0.7,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
  });
  if (!raw) {
    return {
      ok: false,
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Set up a key in Settings.",
    };
  }
  return parseJsonArray<ImagePromptIdea>(raw, (v) =>
    typeof (v as { style?: unknown })?.style === "string" &&
    typeof (v as { prompt?: unknown })?.prompt === "string",
  );
}

const CATEGORY_SYSTEM = `You suggest a primary category and 5-10 SEO-worthy tags for a piece of content. The category should be ONE word or short phrase. Tags should be lowercase, 1-3 words each, mix broad and specific.

Output JSON only:
{ "primaryCategory": "<one>", "alternateCategories": ["<2-4 alternates>"], "tags": ["<5-10 tags>"], "rationale": "<one short sentence>" }`;

export type CategorySuggestion = {
  primaryCategory: string;
  alternateCategories: string[];
  tags: string[];
  rationale: string;
};

export type CategoryResult =
  | { ok: true; suggestion: CategorySuggestion }
  | { ok: false; error: string };

export async function suggestCategoriesAndTags(opts: {
  title: string;
  excerpt?: string;
  existingCategories?: string[];
  clientId?: number | null;
}): Promise<CategoryResult> {
  if (!opts.title.trim()) {
    return { ok: false, error: "Title required." };
  }

  const userPrompt = [
    `Title: ${opts.title}`,
    opts.excerpt ? `Excerpt: ${opts.excerpt.slice(0, 500)}` : "",
    opts.existingCategories && opts.existingCategories.length > 0
      ? `Existing site categories (prefer reusing if relevant): ${opts.existingCategories.slice(0, 30).join(", ")}`
      : "",
    "",
    "Suggest one primary category, 2-4 alternate categories, and 5-10 tags. JSON object only.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callAI({
    system: CATEGORY_SYSTEM,
    user: userPrompt,
    maxTokens: 400,
    temperature: 0.4,
    timeoutMs: 30_000,
    feature: "content_idea",
    clientId: opts.clientId ?? null,
  });
  if (!raw) {
    return {
      ok: false,
      error: lastAiFailure()?.message ?? "AI provider didn't respond. Set up a key in Settings.",
    };
  }

  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "AI returned an unexpected format." };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as CategorySuggestion;
    if (
      typeof parsed?.primaryCategory !== "string" ||
      !Array.isArray(parsed?.tags)
    ) {
      return { ok: false, error: "AI response missing required fields." };
    }
    return {
      ok: true,
      suggestion: {
        primaryCategory: parsed.primaryCategory.trim(),
        alternateCategories: Array.isArray(parsed.alternateCategories)
          ? parsed.alternateCategories.filter((c): c is string => typeof c === "string")
          : [],
        tags: parsed.tags.filter((t): t is string => typeof t === "string"),
        rationale: typeof parsed.rationale === "string" ? parsed.rationale : "",
      },
    };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}

function parseJsonArray<T>(
  raw: string,
  validate: (v: unknown) => boolean,
): { ok: true; prompts: T[] } | { ok: false; error: string } {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return { ok: false, error: "AI returned an unexpected format." };
  }
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { ok: false, error: "AI returned an empty list." };
    }
    const valid = parsed.filter(validate) as T[];
    if (valid.length === 0) {
      return { ok: false, error: "AI returned no valid entries." };
    }
    return { ok: true, prompts: valid };
  } catch {
    return { ok: false, error: "Couldn't parse AI response." };
  }
}
