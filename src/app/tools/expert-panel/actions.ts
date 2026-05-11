"use server";

import { callAI } from "@/lib/ai-call";
import { scoreContent, type SlopReport } from "@/lib/ai-slop-patterns";
import { saveToolRun } from "@/lib/tool-runs";

type ContentType = "blog" | "linkedin" | "landing" | "x" | "email" | "strategy";
type Industry = "saas" | "ecommerce" | "local" | "agency" | "creator" | "general";

const PANEL_BY_TYPE: Record<ContentType, string[]> = {
  blog: ["Blog Editor", "SEO Strategist", "Subject Matter Expert", "Reader Advocate"],
  linkedin: ["LinkedIn Ghostwriter", "B2B Content Strategist", "Comment Bait Optimizer"],
  landing: ["Conversion Copywriter", "UX Writer", "Brand Voice Match"],
  x: ["X/Twitter Veteran", "Engagement Optimizer", "Hook Specialist"],
  email: ["Email Copywriter", "Subject Line Specialist", "Deliverability Coach"],
  strategy: ["Senior Strategist", "Market Analyst", "Pragmatic Operator"],
};

const INDUSTRY_EXPERT: Record<Industry, string> = {
  saas: "SaaS Growth Expert",
  ecommerce: "E-commerce Conversion Expert",
  local: "Local SEO + GBP Expert",
  agency: "Agency Account Director",
  creator: "Creator Economy Expert",
  general: "Industry Generalist",
};

// Non-negotiable roles per source repo
const ALWAYS_ON = ["AI Writing Detector", "Brand Voice Match"];

/**
 * Per-content-type rubrics — what each expert specifically looks for,
 * sourced from content-ops/scoring-rubrics in ericosiu/ai-marketing-skills.
 * The relevant rubric is appended to the system prompt at run time so the
 * panel scores against the right axes for the format.
 */
const RUBRICS: Record<ContentType, string> = {
  blog: `Blog rubric — score against:
  - Hook strength (first 100 words): does it earn the read?
  - Specificity: numbers, names, real examples vs vague claims
  - E-E-A-T signals: first-hand experience, named sources, author authority
  - Skim-readability: heading hierarchy, paragraph length, scannable structure
  - Unique angle: would this rank differently from top-10 SERP results?
  - Search intent match: informational depth without padding`,
  linkedin: `LinkedIn rubric — score against:
  - Hook line: stops the scroll in <2 seconds
  - Line spacing: 1-2 sentence paragraphs only, white space mandatory
  - Story arc: setup → tension → resolution → CTA
  - Concrete takeaway: one specific lesson, not a list of platitudes
  - Comment-bait: question or controversial take that earns reply volume
  - Length: 1100-1300 chars sweet spot, capped before "see more"`,
  landing: `Landing-page rubric — score against:
  - Above-the-fold clarity: who/what/why in <5 seconds
  - Headline-subhead match: pair makes one specific promise
  - Proof density: social proof, numbers, named logos
  - Friction removal: addresses top 3 objections explicitly
  - CTA specificity: action verb + outcome, not "Learn more"
  - Scan-pass test: meaning preserved if you only read headings + buttons`,
  x: `X/Twitter rubric — score against:
  - Hook: first 7 words decide if the reader stops
  - Compression: every word earns its place, no filler
  - Tweetable line: one quotable nugget per thread post
  - Reply-bait: question, hot take, or shareable opinion
  - Voice: human, opinionated, NOT corporate
  - Length: hits the 280-char ceiling efficiently or commits to a thread`,
  email: `Email rubric — score against:
  - Subject + preview: stand-alone promise in <60 chars
  - First sentence: addresses one named reader, not a list
  - Single CTA: one ask, repeated max twice
  - Skim path: meaning preserved by reading subject + first line + CTA
  - Personalization: feels written-for, not blasted
  - Deliverability: avoids spam triggers (excessive caps, ! marks, image-heavy)`,
  strategy: `Strategy-doc rubric — score against:
  - Thesis upfront: TL;DR with the recommendation, not a build-up
  - Evidence per claim: data, sources, or named experiments
  - Trade-offs named: what we lose by saying yes, what we lose by saying no
  - Decision-ready: a senior reader could approve from this doc alone
  - Risk register: top 3 things that go wrong, with mitigation
  - Specificity: dates, owners, success metrics — no "soon" or "improve"`,
};

const SYSTEM_BASE = `You are running a content quality gate. Score the supplied content from the perspective of a panel of named experts.

Output STRICT JSON (no preamble, no markdown fences):
{
  "experts": [
    {
      "name": "<expert name>",
      "score": <0-100>,
      "topThreeWeaknesses": ["<specific>", ...],
      "specificRevisions": ["<concrete edit>", ...]
    }
  ],
  "aggregateScore": <0-100, weighted avg with AI Writing Detector counted 1.5x>,
  "topThreeFixes": ["<priority fix>", ...]
}

Rules:
- Be ruthless. Default to 70 unless content is truly excellent.
- Each expert critiques only their specialty.
- "specificRevisions" must quote the exact phrase to change.
- AI Writing Detector flags banned vocab, negative parallelism, em-dash overuse, sycophancy.
- Brand Voice Match flags promotional puffery and AI-tells.`;

function buildPanel(type: ContentType, industry: Industry): string[] {
  const base = PANEL_BY_TYPE[type];
  const ind = INDUSTRY_EXPERT[industry];
  return [...base, ind, ...ALWAYS_ON];
}

type ExpertScore = {
  name: string;
  score: number;
  topThreeWeaknesses: string[];
  specificRevisions: string[];
};

type PanelRound = {
  round: number;
  aggregateScore: number;
  experts: ExpertScore[];
  topThreeFixes: string[];
  slop: SlopReport;
};

export type ExpertPanelState =
  | null
  | {
      ok: true;
      rounds: PanelRound[];
      finalScore: number;
      shipped: boolean;
      contentType: ContentType;
      industry: Industry;
      panel: string[];
    }
  | { ok: false; error: string };

function safeJson<T>(s: string | null): T | null {
  if (!s) return null;
  const cleaned = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const m = cleaned.match(/\{[\s\S]+\}/);
    if (m) {
      try {
        return JSON.parse(m[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function runExpertPanel(
  _prev: ExpertPanelState,
  formData: FormData,
): Promise<ExpertPanelState> {
  const text = String(formData.get("text") ?? "").trim();
  const contentType = (formData.get("contentType") ?? "blog") as ContentType;
  const industry = (formData.get("industry") ?? "general") as Industry;
  if (!text) return { ok: false, error: "Paste some content to evaluate." };
  if (text.length > 20_000) {
    return {
      ok: false,
      error: "Content too long — keep panel runs under 20,000 characters.",
    };
  }

  const panel = buildPanel(contentType, industry);
  const rounds: PanelRound[] = [];
  const TARGET = 90;
  const MAX_ROUNDS = 3;

  let working = text;
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const slop = scoreContent(working);
    const userPrompt = `Content type: ${contentType}\nIndustry: ${industry}\nExpert panel: ${panel.join(", ")}\n\nLocal slop score (pre-computed, deterministic): ${slop.score}/100 — ${slop.violations.length} violations.\n\nContent:\n"""\n${working}\n"""\n\nScore the content from each expert's perspective. Output the JSON specified.`;

    const raw = await callAI({
      system: `${SYSTEM_BASE}\n\n${RUBRICS[contentType]}`,
      user: userPrompt,
      maxTokens: 2000,
      temperature: 0.3,
      feature: "content_idea",
      ignoreCreditSaver: true,
    });

    const parsed = safeJson<{
      experts: ExpertScore[];
      aggregateScore: number;
      topThreeFixes: string[];
    }>(raw);

    if (!parsed) {
      if (rounds.length === 0) {
        return {
          ok: false,
          error:
            "AI panel scoring failed. Check that an AI provider is configured in Settings → AI.",
        };
      }
      break;
    }

    rounds.push({
      round,
      aggregateScore: parsed.aggregateScore,
      experts: parsed.experts,
      topThreeFixes: parsed.topThreeFixes,
      slop,
    });

    if (parsed.aggregateScore >= TARGET) break;
    // Only 1 round on this tool — content rewriting happens in the writer
    // tools. The user is responsible for iteration here.
    break;
  }

  const finalScore = rounds[rounds.length - 1]?.aggregateScore ?? 0;
  const shipped = finalScore >= TARGET;

  await saveToolRun({
    toolId: "expert-panel",
    label: `${finalScore}/100 · ${panel.length} experts (${contentType}/${industry})`,
    input: { contentType, industry, sourceLen: text.length },
    result: {
      ok: true,
      rounds,
      finalScore,
      shipped,
      contentType,
      industry,
      panel,
    },
  }).catch(() => undefined);

  return {
    ok: true,
    rounds,
    finalScore,
    shipped,
    contentType,
    industry,
    panel,
  };
}
