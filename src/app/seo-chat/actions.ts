"use server";

import { callAIVision, type VisionMessage } from "@/lib/ai-vision";
import { findSkill, type SeoSkillId } from "@/lib/seo-skills";
import { scanSerp } from "@/lib/serp-scanner";
import {
  retrieveKnowledge,
  renderKnowledgeContext,
} from "@/lib/seo-knowledge-base";

export type AnswerLength = "short" | "detailed";

const SEO_SYSTEM_PROMPT = `You are an expert SEO consultant integrated into a self-hosted SEO toolkit. The user can ask anything SEO-related, including uploading images for image-SEO analysis (alt text suggestions, file-name advice, compression, EXIF, schema). Stay strictly on SEO and adjacent topics (content marketing, technical web performance, analytics, accessibility-as-it-affects-SEO). If asked about something off-topic, politely redirect.

Your knowledge spans:
- Google's actual ranking documentation (helpful content, E-E-A-T, page experience, Core Web Vitals, structured data, internal linking, freshness)
- Modern AI search visibility (Google AI Overviews, ChatGPT Search, Perplexity citations, Reddit's role in LLM training)
- Technical SEO (crawl budget, indexability, hreflang, canonical, robots.txt, sitemaps, schema, log file analysis)
- On-page (title/meta best practices, H1/H2 structure, internal linking, anchor text, content briefs)
- Off-page (link building 2026: digital PR, HARO, broken-link, niche edits — NOT PBNs)
- Local SEO (GBP, citations, NAP, local pack, reviews)
- E-commerce SEO (product schema, faceted nav, category optimization, image SEO at scale)
- Image SEO (descriptive alt, filename, format selection, lazy loading, image sitemap, structured data)
- Migration / redirects / international (301s, hreflang, x-default, country/language strategy)

When the user asks "how do I do X", reference the specific tool inside this app where relevant. Available tools (mention by name and link):
- /tools/health-check (full SEO audit per URL)
- /tools/serp-features (AIO + featured snippet + PAA tracking)
- /tools/eeat-audit (E-E-A-T scoring)
- /tools/refresh (content refresh detector)
- /tools/link-recommender (AI internal-link suggestions)
- /tools/auto-link (RankMath-style auto-link)
- /tools/migration-map (redirect map generator)
- /tools/redirects-manager (CRUD redirect manager + 404 log)
- /tools/gsc-coverage (batch URL Inspection)
- /tools/traffic-drop (why-did-traffic-drop diagnostic)
- /tools/ai-schema (AI schema generator from URL)
- /tools/schema-validate (schema validator)
- /tools/local-cwv (local Core Web Vitals)
- /tools/mobile-friendly (mobile-friendly check)
- /tools/anchor-distribution (anchor-text distribution)
- /tools/dns-whois (DNS + RDAP)
- /tools/pagerank (internal PageRank simulator)
- /tools/programmatic-seo (CSV → bulk pages)
- /tools/og-image (OG image generator)
- /tools/social-preview (OG / Twitter card preview)
- /tools/bulk-alt (bulk alt-text)
- /tools/news-headline (News SEO headline audit)
- /tools/disavow (disavow file generator)
- /tools/branded-split (branded vs non-branded GSC split)
- /tools/uptime (uptime + TTFB monitor)
- /tools/robots-history (robots.txt diff history)
- /tools/wayback (Wayback Machine timeline)
- /tools/trending (trending content ideas)
- /knowledge (full SEO knowledge hub)
- /gbp (Google Business Profile management)

Style:
- Plain English. No fluff.
- Specific, action-oriented answers grounded in 2026 SEO reality.
- For image-SEO image-uploads: dissect the image — descriptive alt suggestion, filename advice, format/compression notes, possible structured-data wins (Product / Recipe / VideoObject / etc.), EXIF caveats.
- When suggesting a tool, format as: "Use the [tool name](/tools/path) for this."
- Never recommend deprecated practices (keyword density, exact-match URLs, PBNs, link-buying, AMP).
- 2-6 short paragraphs typical. For lists, use numbered steps when ordered, bullets when not.

If the user pastes a URL: confirm what they want analyzed. Don't pretend to fetch the URL — instead suggest they use a relevant tool from the list and offer to interpret the result they paste back.

Authority + accuracy rules (non-negotiable):
- Prefer the in-app SEO knowledge corpus (injected below) over training-data recall when they overlap. If the corpus says X, you say X.
- When citing best practice, ground it in Google's official Search Central documentation or a Tier-1 source (Moz, Ahrefs, Search Engine Land, Search Engine Journal). NO unsourced advice.
- If you're not certain whether something is current 2026 best practice, say so explicitly ("This was correct as of 2024 — verify on Google's Search Status Dashboard") rather than guess.
- NEVER recommend folklore that Google has explicitly debunked: keyword density targets, meta keywords tag, submit-to-100-directories, AMP for SEO, exact-match URL stuffing, PBNs, link buying, hidden text, doorway pages.
- When the user asks about a hot-button update (March 2026 core update, Helpful Content, AI Overviews, site reputation abuse), pull from the corpus chunk on that topic verbatim — don't reinterpret.
- For tactical questions ("should I do X"): give the answer AND name the rule it comes from ("Per Google's Helpful Content guidance…", "Per Search Engine Land's analysis of the March 2026 update…").

If the user asks "where did you learn this": list the corpus chunk title(s) you drew from + the public source URL the corpus cites.`;

export type SeoChatMessage = {
  role: "user" | "assistant";
  content: string;
  imageDataUrl?: string;
};

export type SeoChatResult =
  | { ok: true; reply: string }
  | { ok: false; error: string };

const MAX_HISTORY = 10;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type SeoChatResearchResult =
  | {
      ok: true;
      reply: string;
      researchSnippet?: string;
      /** ID of the conversation this turn was appended to (for the next turn). */
      conversationId: number;
    }
  | { ok: false; error: string };

export async function seoChat(
  history: SeoChatMessage[],
  imageDataUrl?: string,
  skillId?: SeoSkillId,
  research?: boolean,
  length: AnswerLength = "short",
  modelChoice?: { provider?: string; model?: string },
  conversationId?: number | null,
): Promise<SeoChatResearchResult> {
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return { ok: false, error: "No question to answer." };
  }

  // Validate image
  let parsedImage: { mimeType: string; base64: string } | undefined;
  if (imageDataUrl) {
    const match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return { ok: false, error: "Invalid image data URL." };
    }
    const [, mime, b64] = match;
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/i.test(mime)) {
      return { ok: false, error: "Image must be PNG, JPEG, GIF, or WebP." };
    }
    if (b64.length * 0.75 > MAX_IMAGE_BYTES) {
      return { ok: false, error: "Image too large (>4MB)." };
    }
    parsedImage = { mimeType: mime, base64: b64 };
  }

  const trimmed = history.slice(-MAX_HISTORY);
  const messages: VisionMessage[] = trimmed.map((m, i) => {
    const isLast = i === trimmed.length - 1;
    if (isLast && parsedImage && m.role === "user") {
      return {
        role: "user" as const,
        content: m.content,
        image: parsedImage,
      };
    }
    return { role: m.role, content: m.content };
  });

  const skill = findSkill(skillId ?? "general");
  let fullSystem = skill.systemAddendum
    ? `${SEO_SYSTEM_PROMPT}\n\n[Active focus: ${skill.name}]\n${skill.systemAddendum}`
    : SEO_SYSTEM_PROMPT;

  // === Length mode ===
  // Short = terse answer + smaller token cap (saves credits dramatically)
  // Detailed = full answer
  if (length === "short") {
    fullSystem = `${fullSystem}\n\n[Answer mode: SHORT. Reply in 2-4 sentences max — no preamble, no closing summary, no headers. Lead with the answer. Skip caveats unless they meaningfully change the recommendation.]`;
  } else {
    fullSystem = `${fullSystem}\n\n[Answer mode: DETAILED. Fully explain. Use headers + bullets where they aid scannability. Cap at ~600 words.]`;
  }

  // === Smart knowledge retrieval ===
  // Match the user's most recent message against our SEO knowledge corpus.
  // Inject only the matched chunks — token-efficient RAG.
  const lastUserText = trimmed[trimmed.length - 1]?.content ?? "";
  if (lastUserText.length > 5) {
    const matched = retrieveKnowledge(
      `${skill.name} ${lastUserText}`,
      length === "short" ? 1 : 3,
    );
    const ctx = renderKnowledgeContext(
      matched,
      length === "short" ? 1500 : 4000,
    );
    if (ctx) {
      fullSystem = `${fullSystem}\n\n[Internal knowledge base (use these facts when answering — don't repeat them verbatim, weave into your reply):\n${ctx}\n]`;
    }
  }

  let researchSnippet: string | undefined;
  if (research) {
    const lastUserMsg = trimmed[trimmed.length - 1]?.content ?? "";
    // Heuristic — pull the first sentence as the search query, capped at 120 chars
    const queryRaw = lastUserMsg
      .split(/[.?!\n]/)[0]
      .trim()
      .slice(0, 120);
    if (queryRaw.length >= 3) {
      try {
        const serp = await scanSerp({ query: queryRaw });
        if (serp.ok) {
          const top = serp.topResults.slice(0, 5).map((r, i) =>
            `[${i + 1}] ${r.title}\n    ${r.url}\n    ${(r.snippet ?? "").slice(0, 200)}`,
          );
          const paa = serp.paaQuestions.slice(0, 5);
          const aio = serp.aiOverviewText
            ? `Google AI Overview answer (paraphrased):\n${serp.aiOverviewText.slice(0, 600)}`
            : "";
          researchSnippet = [
            `LIVE RESEARCH for "${queryRaw}":`,
            "",
            top.join("\n\n"),
            paa.length > 0 ? "\nPeople Also Ask:\n" + paa.map((q) => "- " + q).join("\n") : "",
            aio,
          ]
            .filter(Boolean)
            .join("\n");
          fullSystem = `${fullSystem}\n\n[Live research mode is ON — current Google SERP data follows. Cite specific URLs in your reply when relevant.]\n${researchSnippet}`;
        }
      } catch {
        // best-effort — proceed without research if SERP fetch failed
      }
    }
  }

  const reply = await callAIVision({
    system: fullSystem,
    messages,
    // Short: ~250 tok cap. Detailed: ~1500. Saves credits dramatically when
    // user just wants a quick answer.
    maxTokens: length === "short" ? 250 : 1500,
    temperature: length === "short" ? 0.2 : 0.4,
    timeoutMs: 60_000,
    feature: "general",
    providerOverride: modelChoice?.provider as
      | import("@/lib/api-keys").ActiveProvider
      | undefined,
    modelOverride: modelChoice?.model,
  });
  if (!reply) {
    return {
      ok: false,
      error:
        "AI provider didn't respond. Open Settings → AI provider → click Test next to your provider to see the exact error.",
    };
  }

  // Persist this turn — conversationId is null on the very first message,
  // saveChatTurn creates a new conversation in that case.
  let savedConversationId = conversationId ?? null;
  try {
    const { saveChatTurn } = await import("@/lib/chat-store");
    const lastUserMessage = trimmed[trimmed.length - 1]?.content ?? "";
    savedConversationId = await saveChatTurn({
      conversationId: savedConversationId,
      kind: "seo_chat",
      firstUserMessage: lastUserMessage,
      settings: { skill: skill.id, length, research: research ?? false },
      userMessage: lastUserMessage,
      userImageDataUrl: imageDataUrl ?? null,
      assistantReply: reply,
    });
  } catch {
    // Silent — never let persistence break the user's reply
    savedConversationId = savedConversationId ?? -1;
  }

  return {
    ok: true,
    reply,
    researchSnippet,
    conversationId: savedConversationId ?? -1,
  };
}
