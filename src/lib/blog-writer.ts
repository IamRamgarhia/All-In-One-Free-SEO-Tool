import { callAI } from "./ai-call";
import type { GscKeyword } from "./google-data";

export type BlogWriteRequest = {
  /** Brand context */
  clientName: string;
  clientUrl: string;
  niche: string | null;
  description: string | null;
  techStack: string[] | null;

  /** Content brief */
  targetKeyword: string;
  /** Optional supporting keywords to weave in naturally */
  supportingKeywords?: string[];
  tone: "professional" | "casual" | "authoritative" | "friendly";
  audienceLevel: "beginner" | "intermediate" | "expert";
  wordCount: 800 | 1200 | 1500 | 2000;
  /** Specific points or angle the user wants the AI to cover */
  notes?: string;

  /** Optional real-world signals from GSC to ground the post */
  topQueries?: GscKeyword[];
};

export type BlogWriteResult =
  | {
      ok: true;
      markdown: string;
    }
  | {
      ok: false;
      error: string;
    };

const SYSTEM_PROMPT = `You are an expert SEO content writer. You have written hundreds of blog posts that rank in the top 10 of Google search. Your style is human, direct, and informative.

# Writing principles (non-negotiable)

1. **Genuinely useful first.** Answer what the searcher actually wants. SEO comes second.
2. **Specific over generic.** Use concrete examples, real numbers, named tools, named methods. Avoid vague advice.
3. **Show, don't tell.** Replace "X is important" with "Without X, Y happens — for example…".
4. **Vary sentence rhythm.** Mix short (5-10 words) and long sentences. Aim for 30%+ short.
5. **Conversational, not corporate.** Use contractions ("you're", "don't"). Address the reader as "you".
6. **No filler.** Cut anything that doesn't move the post forward.

# SEO requirements (must do)

- Target keyword appears in: H1, the first 100 words, and 1 H2.
- Target keyword density: 0.5–1.5% of total words. Don't stuff.
- Supporting keywords: use each at least once, naturally.
- Internal linking: leave [INTERNAL_LINK: anchor text] markers (max 3) where the writer should link to related pages.
- External linking: cite 1–2 authoritative external sources where it helps trust (e.g. Google docs, government data, peer-reviewed studies). Format: [Source name](https://example.com).

# Strict avoid list (these signal AI-written content and hurt rankings)

- Words: "delve", "tapestry", "embark", "navigate", "unleash", "revolutionize", "harness", "leverage" (as a verb), "in conclusion", "in today's fast-paced world", "in the realm of", "it's important to note that".
- Patterns: opening with "In today's [adjective] world…", three-item rule of three when one example suffices, vague "many studies show", em dash overuse.
- Marketing fluff: superlatives without proof ("game-changing", "revolutionary"), name-dropping without explaining why.

# Required output format

Output **clean markdown** in exactly this shape — no preamble, no closing chatter:

\`\`\`
META_TITLE: [≤60 chars, primary keyword near the front]
META_DESCRIPTION: [≤160 chars, compelling hook + keyword]
URL_SLUG: [kebab-case, ≤6 words]
ESTIMATED_READING_TIME: [N min]

# [H1 with target keyword]

[Intro paragraph: ≤80 words. Hooks the reader by stating the specific problem or outcome. Includes target keyword once, naturally. No throat-clearing.]

## [H2 — first major section]
[Content. 2-4 short paragraphs. Specific. No filler.]

## [H2 — section 2]
...

[4-6 H2 sections total. Use H3 inside H2 only when helpful.]

## Frequently asked questions
### [Question phrased as a real searcher would type it]
[Concise answer, 2-4 sentences.]
### [Question 2]
...
[3-5 FAQs total]

## The bottom line
[Tight summary, 2-3 sentences. One concrete next step / CTA.]
\`\`\`

Stay within the requested word count ±10%.`;

function buildUserPrompt(req: BlogWriteRequest): string {
  const lines: string[] = [];

  lines.push(`# Brief`);
  lines.push(`Client: ${req.clientName} (${req.clientUrl})`);
  if (req.niche) lines.push(`Niche: ${req.niche}`);
  if (req.description) lines.push(`About: ${req.description}`);
  if (req.techStack?.length)
    lines.push(`Tech stack: ${req.techStack.join(", ")}`);
  lines.push("");

  lines.push(`# Content requirements`);
  lines.push(`Target keyword: "${req.targetKeyword}"`);
  if (req.supportingKeywords?.length) {
    lines.push(
      `Supporting keywords: ${req.supportingKeywords.map((k) => `"${k}"`).join(", ")}`,
    );
  }
  lines.push(`Tone: ${req.tone}`);
  lines.push(`Audience level: ${req.audienceLevel}`);
  lines.push(`Target length: ~${req.wordCount} words`);
  lines.push("");

  if (req.notes) {
    lines.push(`# Specific instructions from the editor`);
    lines.push(req.notes);
    lines.push("");
  }

  if (req.topQueries?.length) {
    lines.push(`# Real search data (use to ground the post)`);
    lines.push(
      `These are queries this site already ranks for — weave the angles in if relevant:`,
    );
    for (const q of req.topQueries.slice(0, 6)) {
      lines.push(
        `- "${q.query}" — ${q.clicks} clicks, ${q.impressions} impressions, position ${q.position.toFixed(1)}`,
      );
    }
    lines.push("");
  }

  lines.push(`Write the post now. Output the markdown only.`);
  return lines.join("\n");
}

export async function writeBlogPost(
  req: BlogWriteRequest,
): Promise<BlogWriteResult> {
  // Higher max tokens for longer-form content. Most providers cap at 4096.
  const maxTokens = Math.min(4000, req.wordCount * 2 + 500);

  const result = await callAI({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(req),
    maxTokens,
    temperature: 0.7,
    timeoutMs: 90_000,
  });

  if (!result) {
    return {
      ok: false,
      error:
        "AI provider didn't return a response. Check your API key in Settings → AI providers, or that the active provider has quota.",
    };
  }
  return { ok: true, markdown: result };
}

/**
 * Suggest blog topics for a client based on real Google data + niche
 * heuristics. Used to populate the topic-picker UI.
 */
export type TopicSuggestion = {
  source: "quick_win" | "niche";
  title: string;
  targetKeyword: string;
  rationale: string;
};

export function suggestTopicsFromQuickWins(
  quickWins: GscKeyword[],
): TopicSuggestion[] {
  return quickWins.slice(0, 8).map((q) => ({
    source: "quick_win" as const,
    title: titleCase(q.query),
    targetKeyword: q.query,
    rationale: `Already ranks #${q.position.toFixed(1)} with ${q.impressions.toLocaleString()} impressions — a refreshed/expanded post can push it onto page 1.`,
  }));
}

export function suggestTopicsFromNiche(
  niche: string | null,
  brandName: string,
): TopicSuggestion[] {
  const ideas: Record<string, { title: string; keyword: string }[]> = {
    local: [
      {
        title: `What to look for when choosing a {service} provider near you`,
        keyword: `how to choose a local {service}`,
      },
      {
        title: `${brandName} vs the competition: how we compare`,
        keyword: `${brandName} alternatives`,
      },
      {
        title: `The complete guide to our service area`,
        keyword: `{service} in {city}`,
      },
    ],
    ecommerce: [
      {
        title: `Buyer's guide: how to pick the right {product} for your needs`,
        keyword: `best {product} guide`,
      },
      {
        title: `{Product} comparison: top options reviewed`,
        keyword: `{product} comparison`,
      },
      {
        title: `Common mistakes when buying {product} (and how to avoid them)`,
        keyword: `{product} buying mistakes`,
      },
    ],
    saas: [
      {
        title: `How {brand} compares to [competitor]`,
        keyword: `${brandName} vs alternative`,
      },
      {
        title: `Use case: how teams use ${brandName} to do X`,
        keyword: `${brandName} use cases`,
      },
      {
        title: `${brandName} pricing explained`,
        keyword: `${brandName} pricing`,
      },
    ],
    blog: [
      {
        title: `Beginner's guide to {topic}`,
        keyword: `{topic} for beginners`,
      },
      {
        title: `{Topic} mistakes to avoid`,
        keyword: `common {topic} mistakes`,
      },
      {
        title: `How {brand} approaches {topic}`,
        keyword: `${brandName} approach to {topic}`,
      },
    ],
    services: [
      {
        title: `Pricing guide: what does professional {service} cost?`,
        keyword: `{service} pricing`,
      },
      {
        title: `How to evaluate a {service} provider`,
        keyword: `choose a {service} provider`,
      },
      {
        title: `${brandName} case studies: real client outcomes`,
        keyword: `${brandName} case studies`,
      },
    ],
  };

  const list = ideas[niche ?? ""] ?? ideas.blog;
  return list.map((i) => ({
    source: "niche" as const,
    title: i.title,
    targetKeyword: i.keyword,
    rationale: `Standard ${niche ?? "content"} content angle — fill in {placeholders} with your actual product/service/topic.`,
  }));
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 3 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
