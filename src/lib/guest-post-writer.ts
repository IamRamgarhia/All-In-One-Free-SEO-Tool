/**
 * AI guest-post writer with style-matching + humanization + E-E-A-T guardrails.
 *
 * Given a target site (Medium / Search Engine Journal / etc.), a client, a
 * topic and target keyword, produce a draft that:
 *
 *   1) Matches that site's house style (tone, voice, length, mustDo/mustAvoid
 *      lifted from the site's profile in `guest-post-sites.ts`).
 *
 *   2) Reads human, not AI. We instruct the model to:
 *      - vary sentence length (some 6 words, some 22 words)
 *      - use contractions naturally
 *      - avoid AI tropes (e.g. "in today's digital landscape", "let's dive
 *        in", "embark on", "delve into", "navigate the complexities of")
 *      - include at least one specific number or proper noun per ~250 words
 *      - include one personal anecdote or concrete example
 *
 *   3) Won't get the site or the client's site penalized:
 *      - no keyword stuffing (target keyword appears 2-4 times max, not in
 *        every paragraph)
 *      - one natural anchor link to client (placed mid-piece, descriptive
 *        anchor, not exact-match)
 *      - cite at least 2 authoritative outbound sources (Google docs, study,
 *        original research) — this is what E-E-A-T actually rewards
 *      - no plagiarized phrasing — the model is told to write fresh, not
 *        rephrase existing content
 *      - no AI disclosure tics ("As an AI", "I think", "Hopefully this helps")
 *      - explicit byline + author bio block at the end (E-E-A-T author signal)
 *
 *   4) Produces output the user can paste straight into the platform:
 *      - markdown with headings the platform actually uses
 *      - working code blocks where appropriate
 *      - explicit "Cover image idea" line at the top so user can grab one
 */

import { callAI } from "./ai-call";
import { getGuestPostSiteById, type GuestPostSite } from "./guest-post-sites";

export type GuestPostInput = {
  siteId: string;
  clientName: string;
  clientUrl: string;
  niche: string | null;
  city: string | null;
  /** Free-text — what's the post about? */
  topic: string;
  /** What keyword should this post help the post (or the client) rank for? */
  targetKeyword: string;
  /** Optional supporting keywords. */
  supportingKeywords?: string;
  /** Author display name for the byline. */
  authorName?: string;
  /** Author short bio for the footer block. */
  authorBio?: string;
  /** Per-call provider override. */
  providerOverride?: import("./api-keys").ActiveProvider;
  modelOverride?: string;
};

export type GuestPostResult =
  | {
      ok: true;
      site: GuestPostSite;
      markdown: string;
      meta: {
        wordCount: number;
        targetKeywordOccurrences: number;
        headingsCount: number;
      };
    }
  | { ok: false; error: string };

const AI_TROPES_TO_AVOID = [
  "in today's digital landscape",
  "in the ever-evolving world of",
  "let's dive in",
  "let's delve into",
  "embark on this journey",
  "navigate the complexities of",
  "unlock the potential",
  "harness the power of",
  "in conclusion",
  "it is important to note that",
  "it goes without saying",
  "at the end of the day",
  "the fact of the matter is",
  "moreover, furthermore, additionally — used in sequence",
].join("; ");

export async function writeGuestPost(
  input: GuestPostInput,
): Promise<GuestPostResult> {
  const site = getGuestPostSiteById(input.siteId);
  if (!site) return { ok: false, error: `Unknown site: ${input.siteId}` };
  if (!input.topic.trim()) return { ok: false, error: "Topic is required." };
  if (!input.targetKeyword.trim())
    return { ok: false, error: "Target keyword is required." };

  const linkPolicy = describeLinkPolicy(site);

  const system = buildSystemPrompt(site, linkPolicy);
  const user = buildUserPrompt(input, site);

  const text = await callAI({
    system,
    user,
    maxTokens: site.style.wordCount.max > 2500 ? 4500 : 3000,
    temperature: 0.7,
    feature: "blog_draft",
    timeoutMs: 120_000,
    ignoreCreditSaver: true, // long-form needs the room
    providerOverride: input.providerOverride,
    modelOverride: input.modelOverride,
  });
  if (!text)
    return {
      ok: false,
      error:
        "AI provider didn't return a draft. Configure an AI provider in Settings.",
    };

  const markdown = text.trim();
  return {
    ok: true,
    site,
    markdown,
    meta: {
      wordCount: countWords(markdown),
      targetKeywordOccurrences: countOccurrences(markdown, input.targetKeyword),
      headingsCount: (markdown.match(/^#{1,6} /gm) || []).length,
    },
  };
}

function describeLinkPolicy(site: GuestPostSite): string {
  if (site.dofollowPolicy === "nofollow") {
    return "Outbound links from this platform are nofollow by default — the link's value is referral / brand, not direct ranking. Place the client link naturally where it actually helps the reader. Do NOT use exact-match anchor text.";
  }
  if (site.dofollowPolicy === "dofollow") {
    return "Outbound links can be dofollow on this platform. Still, place the client link naturally and use descriptive (not exact-match) anchor text. One client link in the body, one optional in the author bio.";
  }
  return "This platform mixes dofollow and nofollow. Treat all body links as informational citations and place the client link naturally with descriptive anchor text. The author bio is your primary brand link.";
}

function buildSystemPrompt(site: GuestPostSite, linkPolicy: string): string {
  return `You are a senior writer publishing a piece on ${site.name} (${site.domain}). Match this publication's house style exactly. Generic AI output will be rejected and the client may be banned.

# House style for ${site.name}
- Tone: ${site.style.tone}
- Voice: ${site.style.voice}
- Word count target: ${site.style.wordCount.min}-${site.style.wordCount.max}, ideal around ${site.style.wordCount.ideal}
- Heading style: ${site.style.headings}
- Linking policy on this platform: ${site.style.linking}

## Must do
${site.style.mustDo.map((m) => `- ${m}`).join("\n")}

## Must avoid
${site.style.mustAvoid.map((m) => `- ${m}`).join("\n")}

# How to write so the post ranks AND doesn't get the client penalized
- Do NOT keyword-stuff. The target keyword should appear 2-4 times in the entire piece — once in the first paragraph, once in a heading where natural, and once or twice in body. Never in consecutive sentences.
- Cite at least 2 authoritative outbound sources (Google's official docs, peer-reviewed research, the platform's own documentation, government/.edu data). Link out — Google rewards posts that connect readers to better information.
- ${linkPolicy}
- Use varied sentence lengths. Mix short punches (5-9 words) with longer flowing sentences (18-26 words). Avoid uniform paragraph rhythms — that's the #1 AI tell.
- Use contractions ("doesn't", "we'll") where natural for the platform's tone.
- Include one specific number or proper noun per ~250 words. Real numbers, real names, real dates.
- Include at least one personal anecdote, real example, or concrete scene. Made-up examples are fine if clearly hypothetical ("imagine a SaaS founder…"), but a real one is stronger.
- Never use these tropes: ${AI_TROPES_TO_AVOID}
- Do NOT include phrases like "As an AI", "I think this might", "Hopefully this helps" — write with confidence.
- End with a byline + author bio block (3-4 lines) including a single brand link in the bio.

# Output format
Output ONLY the post as Markdown. Start with:
\`\`\`
> Cover image idea: [one short visual prompt]
\`\`\`
Then the title as # heading. Then the body. End with:
\`\`\`
---
**About the author** — [author bio with one descriptive-anchor link to the client site]
\`\`\``;
}

function buildUserPrompt(input: GuestPostInput, site: GuestPostSite): string {
  return `Write the guest post.

## Topic
${input.topic.trim()}

## Target keyword (use 2-4 times, naturally)
"${input.targetKeyword.trim()}"

${input.supportingKeywords ? `## Supporting keywords\n${input.supportingKeywords}\n` : ""}

## Client to link to
- Name: ${input.clientName}
- URL: ${input.clientUrl}
${input.niche ? `- Niche: ${input.niche}` : ""}
${input.city ? `- City: ${input.city}` : ""}

${input.authorName ? `## Author byline\n${input.authorName}\n` : ""}
${input.authorBio ? `## Author bio (use this verbatim or close to it)\n${input.authorBio}\n` : ""}

## Length
Target ${site.style.wordCount.ideal} words (band: ${site.style.wordCount.min}-${site.style.wordCount.max}).

Now write the full post in markdown.`;
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle.trim()) return 0;
  const re = new RegExp(
    `\\b${needle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "gi",
  );
  const m = haystack.match(re);
  return m ? m.length : 0;
}

/**
 * Quick post-write QA. Flags issues that suggest the draft will fail
 * platform review or read as AI:
 *   - keyword stuffing (target keyword > 6 times)
 *   - too short / too long for the platform
 *   - missing outbound citations
 *   - tropes detected
 */
export type QaIssue = {
  severity: "warn" | "error";
  message: string;
};

export function reviewGuestPostDraft(
  markdown: string,
  site: GuestPostSite,
  targetKeyword: string,
): QaIssue[] {
  const issues: QaIssue[] = [];
  const wc = countWords(markdown);
  if (wc < site.style.wordCount.min) {
    issues.push({
      severity: "warn",
      message: `Draft is ${wc} words; ${site.name} expects at least ${site.style.wordCount.min}.`,
    });
  }
  if (wc > site.style.wordCount.max) {
    issues.push({
      severity: "warn",
      message: `Draft is ${wc} words; ${site.name} typically caps at ${site.style.wordCount.max}.`,
    });
  }
  const occ = countOccurrences(markdown, targetKeyword);
  if (occ > 6) {
    issues.push({
      severity: "error",
      message: `Target keyword "${targetKeyword}" appears ${occ} times — that's keyword stuffing. Aim for 2-4.`,
    });
  }
  if (occ === 0 && targetKeyword.trim()) {
    issues.push({
      severity: "warn",
      message: `Target keyword "${targetKeyword}" doesn't appear at all in the draft.`,
    });
  }
  const externalLinks = (
    markdown.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/g) || []
  ).length;
  if (externalLinks < 2) {
    issues.push({
      severity: "warn",
      message: `Only ${externalLinks} outbound link(s) detected — E-E-A-T guidance suggests at least 2 authoritative citations.`,
    });
  }
  // Trope detection
  const tropes = [
    "in today's digital landscape",
    "in the ever-evolving",
    "let's dive in",
    "delve into",
    "embark on",
    "navigate the complexities",
    "unlock the potential",
    "harness the power",
    "at the end of the day",
    "it goes without saying",
  ];
  const lower = markdown.toLowerCase();
  const hits = tropes.filter((t) => lower.includes(t));
  if (hits.length > 0) {
    issues.push({
      severity: "warn",
      message: `AI tropes detected: ${hits.slice(0, 3).join(", ")}. Rewrite those sentences in your own voice.`,
    });
  }
  return issues;
}
