/**
 * Per-client daily automation orchestrator.
 *
 * Two responsibilities:
 *   1. tickScheduleGeneration() — find schedules due now, generate the
 *      right kind of content via AI, drop it into publish_queue.
 *   2. tickQueuePublish() — find approved queue items, route each to the
 *      right publisher (WordPress / GBP / etc), mark published or failed.
 *
 * Both are called from daily-agent.ts so the existing 24h ticker drives
 * them. Nothing here runs more often than that.
 */

import { and, asc, desc, eq, gte, lte, or, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  clients,
  dailySchedules,
  keywords,
  keywordRankings,
  publishQueue,
  tasks,
  type Client,
  type DailySchedule,
  type PublishQueueItem,
} from "@/db/schema";
import { callAI } from "./ai-call";
import { logActivity } from "./activity";
import {
  retrieveKnowledge,
  renderKnowledgeContext,
} from "./seo-knowledge-base";

const KIND_LABEL = {
  blog_draft: "Blog draft",
  gbp_post: "GBP post",
  social_post: "Social post",
  internal_checklist: "Daily checklist",
} as const;

/** The same labels for the activity log of a French workspace. */
const KIND_LABEL_FR: Record<keyof typeof KIND_LABEL, string> = {
  blog_draft: "brouillon d’article",
  gbp_post: "publication Google",
  social_post: "publication réseaux sociaux",
  internal_checklist: "liste du jour",
};

export type ScheduleKind = keyof typeof KIND_LABEL;

/**
 * Move a schedule's nextRunAt forward by cadenceDays. Called after
 * either successful generation or a failed attempt — either way the
 * next attempt is one cadence in the future, not immediately.
 */
function computeNextRun(s: DailySchedule, from: Date = new Date()): Date {
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + Math.max(1, s.cadenceDays));
  // Snap to the schedule's timeUtc (HHMM)
  const hh = Math.floor(s.timeUtc / 100);
  const mm = s.timeUtc % 100;
  next.setUTCHours(hh, mm, 0, 0);
  return next;
}

// ─────────────────────────────────────────────────────────────────────
// Generation phase
// ─────────────────────────────────────────────────────────────────────

export async function tickScheduleGeneration(): Promise<{
  generated: number;
  skipped: number;
}> {
  const now = new Date();
  const due = await db
    .select()
    .from(dailySchedules)
    .where(
      and(
        eq(dailySchedules.enabled, true),
        or(
          isNull(dailySchedules.nextRunAt),
          lte(dailySchedules.nextRunAt, now),
        ),
      ),
    );

  let generated = 0;
  let skipped = 0;
  for (const s of due) {
    try {
      const item = await generateForSchedule(s);
      if (!item) {
        skipped++;
        continue;
      }
      await db.insert(publishQueue).values({
        scheduleId: s.id,
        clientId: s.clientId,
        kind: s.kind,
        status: s.autoPublish ? "approved" : "pending_review",
        title: item.title,
        body: item.body,
        payloadJson: item.payload ?? null,
        scheduledFor: now,
      });
      await db
        .update(dailySchedules)
        .set({
          lastRunAt: now,
          nextRunAt: computeNextRun(s, now),
          updatedAt: now,
        })
        .where(eq(dailySchedules.id, s.id));
      generated++;
    } catch (err) {
      // Schedule a retry one cadence later regardless — don't loop on a
      // permanently-broken schedule.
      await db
        .update(dailySchedules)
        .set({
          lastRunAt: now,
          nextRunAt: computeNextRun(s, now),
          updatedAt: now,
        })
        .where(eq(dailySchedules.id, s.id));
      await logActivity({
        kind: "audit.completed",
        clientId: s.clientId,
        level: "warning",
        message: `Auto-${s.kind}: generation failed — ${(err as Error).message?.slice(0, 200) ?? "unknown"}`,
        messageFr: `Automatique (${s.kind}) : échec de la génération, ${(err as Error).message?.slice(0, 200) ?? "erreur inconnue"}`,
      });
      skipped++;
    }
  }
  return { generated, skipped };
}

type GeneratedItem = {
  title: string | null;
  body: string;
  payload?: Record<string, unknown>;
};

/**
 * Build a rich context block from everything we know about the client.
 * The same prompt-injection pattern as /seo-chat — but tuned for content
 * generation: niche, tech stack, top GSC queries (when persisted),
 * recent striking-distance keywords, and the knowledge corpus chunk
 * matched against the topic seed.
 *
 * The output is plain text suitable for appending to the AI system
 * prompt. Empty if nothing's known.
 */
async function buildClientContext(opts: {
  client: Client;
  topicSeed: string;
}): Promise<string> {
  const { client, topicSeed } = opts;
  const lines: string[] = [];

  lines.push(`[Client context]`);
  lines.push(`- Name: ${client.name}`);
  lines.push(`- Site: ${client.url}`);
  if (client.niche) lines.push(`- Niche: ${client.niche}`);
  if (client.techStack && client.techStack.length > 0) {
    lines.push(`- Tech stack: ${client.techStack.join(", ")}`);
  }

  // Recent striking-distance keywords from the rank tracker — these are
  // queries the client is close to ranking for. Mentioning them in new
  // content is a high-value internal-linking + topical-authority signal.
  try {
    const recent = await db
      .select({
        query: keywords.query,
        position: keywordRankings.position,
      })
      .from(keywordRankings)
      .innerJoin(keywords, eq(keywords.id, keywordRankings.keywordId))
      .where(
        and(
          eq(keywords.clientId, client.id),
          gte(
            keywordRankings.checkedAt,
            new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          ),
        ),
      )
      .orderBy(desc(keywordRankings.checkedAt))
      .limit(50);
    const strikingDistance = recent
      .filter((r) => r.position !== null && r.position >= 4 && r.position <= 20)
      .slice(0, 8)
      .map((r) => `${r.query} (#${r.position})`);
    if (strikingDistance.length > 0) {
      lines.push(
        `- Striking-distance queries (use 1-2 in the content if they fit naturally): ${strikingDistance.join("; ")}`,
      );
    }
  } catch {
    // Best-effort — never let context lookup fail the generation
  }

  // Inject knowledge-base chunks matched against the topic. Same
  // pattern as /seo-chat — token-efficient RAG.
  try {
    const matched = retrieveKnowledge(`${client.niche ?? ""} ${topicSeed}`, 2);
    const ctx = renderKnowledgeContext(matched, 2000);
    if (ctx) {
      lines.push(``);
      lines.push(`[Internal knowledge — weave these facts in, don't quote verbatim]`);
      lines.push(ctx);
    }
  } catch {
    // Best-effort
  }

  return lines.join("\n");
}

async function generateForSchedule(
  s: DailySchedule,
): Promise<GeneratedItem | null> {
  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, s.clientId))
    .limit(1);
  if (!client) return null;

  const cfg = (s.configJson ?? {}) as Record<string, unknown>;
  const topicSeed = String(cfg.topic_seed ?? client.niche ?? "SEO");
  const tone = String(cfg.tone ?? "professional, plain English");
  const context = await buildClientContext({ client, topicSeed });

  if (s.kind === "blog_draft") {
    return withBlogExportMeta(
      await generateBlogDraft({ client, topicSeed, tone, context }),
      cfg,
    );
  }
  if (s.kind === "gbp_post") {
    const maxChars = clampGbpMaxChars(cfg.max_chars);
    if (cfg.gbp_source === "woo_product") {
      const product = await pickWooProduct(s, client);
      return generateGbpProductPost({ client, tone, product, maxChars });
    }
    return generateGbpPost({
      client,
      topicSeed,
      tone,
      context,
      postType: String(cfg.post_type ?? "STANDARD"),
      maxChars,
    });
  }
  if (s.kind === "social_post") {
    return generateSocialPost({ client, topicSeed, tone, context });
  }
  if (s.kind === "internal_checklist") {
    return generateChecklist({ client, context });
  }
  return null;
}

/** The schedule's AI brief rides along on the queue item for the "Download .md for AI" export. */
function withBlogExportMeta(
  item: GeneratedItem | null,
  cfg: Record<string, unknown>,
): GeneratedItem | null {
  if (!item) return item;
  const brief = typeof cfg.ai_brief === "string" ? cfg.ai_brief.trim() : "";
  if (!brief) return item;
  return { ...item, payload: { ...item.payload, aiBrief: brief } };
}

async function generateBlogDraft(opts: {
  client: Client;
  topicSeed: string;
  tone: string;
  context: string;
}): Promise<GeneratedItem | null> {
  const system = `You are an expert SEO content writer working on a real blog for ${opts.client.name} (${opts.client.url}).

Write ONE complete blog post in HTML. 800-1200 words. Structure:
- Opening tl;dr (1-2 sentences, no header)
- 50-word intro paragraph that frames the problem
- 3-5 H2 subheadings, each followed by 2-4 paragraphs / a list when it helps
- Closing paragraph with a clear next step
- Use <p>, <h2>, <ul>, <ol>, <strong>, <em>, <blockquote>, <code>
- NEVER include <html>, <body>, <h1>, <head>, or <style> tags — the H1 comes from the title field and styling is the WP theme's job
- NEVER hallucinate specific statistics, customer names, or product features. Stay grounded in what's plausible for the niche.
- Tone: ${opts.tone}

The post should be the kind a smart human editor would publish without rewriting it — specific examples, real-world phrasing, no "in today's fast-paced world" filler.`;

  const user = `${opts.context}

[Today's brief]
Topic seed: "${opts.topicSeed}"

Pick a specific, useful angle the audience would actually search for. Don't write a generic listicle — pick a real question and answer it well.

Output strict JSON only — no markdown fences, no preamble:

{
  "title": "55-65 char post title that would earn a click in SERP",
  "metaDescription": "140-160 char SEO description that summarizes the answer",
  "excerpt": "1-sentence WP excerpt (≤180 chars) — the social-share teaser",
  "keywords": ["the 3-6 search queries this post targets, as people would type them"],
  "language": "ISO 639-1 code of the language the post is written in, e.g. \"en\" or \"fr\"",
  "contentHtml": "the full body as HTML, no <html>/<body>/<h1>"
}`;
  const raw = await callAI({
    purpose: "background",
    system,
    user,
    maxTokens: 3500,
    temperature: 0.7,
    timeoutMs: 120_000,
    ignoreCreditSaver: true,
    feature: "blog_draft",
    clientId: opts.client.id,
  });
  if (!raw) return null;
  const parsed = extractJson(raw) as {
    title?: string;
    metaDescription?: string;
    excerpt?: string;
    keywords?: unknown;
    language?: unknown;
    contentHtml?: string;
  } | null;
  if (!parsed || !parsed.title || !parsed.contentHtml) return null;
  // Kept on the queue item for the .md export's frontmatter.
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords
        .map((k) => String(k).trim().slice(0, 100))
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const language =
    typeof parsed.language === "string" && /^[a-z]{2}(-[a-z]{2})?$/i.test(parsed.language.trim())
      ? parsed.language.trim().toLowerCase()
      : (opts.client.language ?? "en");
  return {
    title: parsed.title.slice(0, 200),
    body: parsed.contentHtml,
    payload: {
      metaDescription: (parsed.metaDescription ?? "").slice(0, 200),
      excerpt: (parsed.excerpt ?? "").slice(0, 300),
      keywords,
      language,
    },
  };
}

/**
 * Schedule's `max_chars` → a post length Google accepts (it caps posts at
 * 1500). Schedules created before the setting existed keep their 1300.
 */
function clampGbpMaxChars(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.max(150, Math.min(1500, n)) : 1300;
}

/** "360–600 characters total, hard limit 600" for a 600 cap. */
function gbpLengthRule(maxChars: number): string {
  return `${Math.round(maxChars * 0.6)}–${maxChars} characters total, hard limit ${maxChars}`;
}

/**
 * Most popular in-stock product with a photo that this schedule hasn't
 * posted in its last 20 items, so a daily schedule walks the catalogue
 * instead of repeating the best-seller. Throws (logged by the tick) when
 * the shop can't be read or has nothing to show.
 */
async function pickWooProduct(
  s: DailySchedule,
  client: Client,
): Promise<import("./woo-products").WooProduct> {
  const { listWooProducts } = await import("./woo-products");
  const products = (
    await listWooProducts(client.url, { locale: client.language ?? "en" })
  ).filter((p) => p.imageUrl);
  if (products.length === 0) {
    throw new Error("the WooCommerce shop has no in-stock product with a photo");
  }
  const recent = await db
    .select({ payloadJson: publishQueue.payloadJson })
    .from(publishQueue)
    .where(eq(publishQueue.scheduleId, s.id))
    .orderBy(desc(publishQueue.createdAt))
    .limit(20);
  const used = new Set(
    recent.map((r) => (r.payloadJson as { productId?: number } | null)?.productId),
  );
  return products.find((p) => !used.has(p.id)) ?? products[0];
}

async function generateGbpProductPost(opts: {
  client: Client;
  tone: string;
  product: import("./woo-products").WooProduct;
  maxChars: number;
}): Promise<GeneratedItem | null> {
  const { product } = opts;
  const system = `You write Google Business Profile posts that showcase ONE product from an online shop. Constraints:
- ${gbpLengthRule(opts.maxChars)}
- 1–3 short paragraphs separated by a blank line
- Plain text: no markdown, no bullet symbols, at most 2 hashtags
- Name the product and the one or two benefits a buyer cares about most
- Mention the price only if it is given below; never invent prices, discounts or stock levels
- No [placeholder] brackets, no "we are excited to" filler
- End by inviting the reader to buy — the post's button opens the product page
- Write in the same language as the product name and description
- Tone: ${opts.tone}`;
  const user = `[Shop]
${opts.client.name} — ${opts.client.url ?? ""}

[Product]
Name: ${product.name}
Price: ${product.price ?? "not shown"}
Description: ${product.shortDescription || "(none)"}

Output strict JSON only — no markdown fences:

{ "summary": "the post text, paragraphs separated by \\n\\n" }`;
  const raw = await callAI({
    purpose: "background",
    system,
    user,
    maxTokens: 600,
    temperature: 0.6,
    timeoutMs: 60_000,
    feature: "general",
    clientId: opts.client.id,
  });
  if (!raw) return null;
  const parsed = extractJson(raw) as { summary?: string } | null;
  if (!parsed?.summary) return null;
  const { trimToLength } = await import("./woo-products");
  return {
    title: product.name.slice(0, 80),
    body: trimToLength(parsed.summary, opts.maxChars),
    payload: {
      callToAction: "SHOP",
      // The button opens the product, the photo is the product's own.
      ctaUrl: product.permalink,
      mediaUrl: product.imageUrl,
      productId: product.id,
      productName: product.name,
      postType: "STANDARD",
    },
  };
}

async function generateGbpPost(opts: {
  client: Client;
  topicSeed: string;
  tone: string;
  context: string;
  postType: string;
  maxChars: number;
}): Promise<GeneratedItem | null> {
  const system = `You write Google Business Profile posts for local businesses. Constraints:
- ${gbpLengthRule(opts.maxChars)}
- Lead with the benefit, not a greeting
- Specific over generic — name a service, a season, a price range, an actual menu item
- No emoji spam (1 emoji max, only if it adds clarity)
- No "we are excited to" / "we are thrilled to" filler
- End with a single clear next step
- Tone: ${opts.tone}`;
  const user = `${opts.context}

[Today's brief]
Topic seed: "${opts.topicSeed}"
Post type: ${opts.postType}

Pick the most timely angle for this business. Output strict JSON only — no markdown fences:

{
  "summary": "the post text, at most ${opts.maxChars} chars",
  "callToAction": "BOOK"|"ORDER"|"SHOP"|"LEARN_MORE"|"SIGN_UP"|"CALL"|null
}`;
  const raw = await callAI({
    purpose: "background",
    system,
    user,
    maxTokens: 800,
    temperature: 0.6,
    timeoutMs: 60_000,
    feature: "general",
    clientId: opts.client.id,
  });
  if (!raw) return null;
  const parsed = extractJson(raw) as {
    summary?: string;
    callToAction?: string | null;
  } | null;
  if (!parsed || !parsed.summary) return null;
  const { trimToLength } = await import("./woo-products");
  return {
    title: parsed.summary.slice(0, 80),
    body: trimToLength(parsed.summary, opts.maxChars),
    payload: {
      callToAction: parsed.callToAction ?? null,
      postType: opts.postType,
    },
  };
}

async function generateSocialPost(opts: {
  client: Client;
  topicSeed: string;
  tone: string;
  context: string;
}): Promise<GeneratedItem | null> {
  const system = `You write short-form social posts. Make each platform variant distinct:
- X / Twitter: 1-2 punchy lines, hook → payoff, ≤270 chars
- LinkedIn: 3-5 line micro-essay with a real insight, ≤700 chars
- No emoji spam, no hashtag walls (LinkedIn: max 3 hashtags at the end; X: 0-1)
- Tone: ${opts.tone}`;
  const user = `${opts.context}

[Today's brief]
Topic seed: "${opts.topicSeed}"

Output strict JSON only — no markdown fences:

{ "x": "X post ≤270 chars", "linkedin": "LinkedIn post ≤700 chars" }`;
  const raw = await callAI({
    purpose: "background",
    system,
    user,
    maxTokens: 800,
    temperature: 0.7,
    timeoutMs: 60_000,
    feature: "general",
    clientId: opts.client.id,
  });
  if (!raw) return null;
  const parsed = extractJson(raw) as {
    x?: string;
    linkedin?: string;
  } | null;
  if (!parsed || (!parsed.x && !parsed.linkedin)) return null;
  return {
    title: (parsed.x ?? parsed.linkedin ?? "").slice(0, 80),
    body: [
      parsed.x ? `--- X / Twitter ---\n${parsed.x}` : "",
      parsed.linkedin ? `--- LinkedIn ---\n${parsed.linkedin}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    payload: { x: parsed.x ?? null, linkedin: parsed.linkedin ?? null },
  };
}

async function generateChecklist(opts: {
  client: Client;
  context: string;
}): Promise<GeneratedItem | null> {
  const system = `You are an SEO project manager generating today's actionable checklist for ${opts.client.name}.

Rules:
- Each item should be doable in 15-60 minutes
- Reference the client's actual context (their niche, their stack) — never generic "do SEO" advice
- Tie each item to a measurable outcome where possible
- 3-5 items max, ordered by impact`;
  const user = `${opts.context}

Output strict JSON only — no markdown fences:

{ "items": [{ "title": "≤80 chars action", "why": "1-sentence rationale tied to this client" }, ...] }`;
  const raw = await callAI({
    purpose: "background",
    system,
    user,
    maxTokens: 800,
    temperature: 0.5,
    timeoutMs: 45_000,
    feature: "general",
    clientId: opts.client.id,
  });
  if (!raw) return null;
  const parsed = extractJson(raw) as {
    items?: { title?: string; why?: string }[];
  } | null;
  if (!parsed?.items?.length) return null;
  const items = parsed.items
    .filter((i) => i.title)
    .slice(0, 5)
    .map((i) => ({ title: String(i.title), why: String(i.why ?? "") }));
  return {
    title: `Today's checklist — ${items.length} item${items.length === 1 ? "" : "s"}`,
    body: items.map((i, n) => `${n + 1}. ${i.title}\n   ${i.why}`).join("\n\n"),
    payload: { items },
  };
}

function extractJson(raw: string): unknown {
  // Strip markdown fences if the model wrapped its JSON
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall back to grabbing the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Publish phase
// ─────────────────────────────────────────────────────────────────────

export async function tickQueuePublish(): Promise<{
  published: number;
  failed: number;
}> {
  const pending = await db
    .select()
    .from(publishQueue)
    // Approved is not "now": an item approved today for next Tuesday
    // waits for Tuesday. Before, every approved item went out on the next
    // tick, so a client approving a post scheduled for later published it
    // at once.
    .where(and(eq(publishQueue.status, "approved"), lte(publishQueue.scheduledFor, new Date())))
    .orderBy(asc(publishQueue.scheduledFor))
    .limit(20); // safety cap per tick

  let published = 0;
  let failed = 0;

  for (const item of pending) {
    const result = await publishOne(item);
    if (result.ok) {
      await db
        .update(publishQueue)
        .set({
          status: "published",
          publishedAt: new Date(),
          publishedRef: result.ref ?? null,
          errorMsg: null,
          updatedAt: new Date(),
        })
        .where(eq(publishQueue.id, item.id));
      await logActivity({
        kind: "audit.completed",
        clientId: item.clientId,
        level: "success",
        message: `Auto-published ${KIND_LABEL[item.kind]}: ${item.title ?? "untitled"}`,
        messageFr: `Publié automatiquement (${KIND_LABEL_FR[item.kind]})\u00a0: ${item.title ?? "sans titre"}`,
      });
      published++;
    } else {
      await db
        .update(publishQueue)
        .set({
          status: "failed",
          errorMsg: result.error.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(eq(publishQueue.id, item.id));
      await logActivity({
        kind: "audit.completed",
        clientId: item.clientId,
        level: "warning",
        message: `Auto-publish failed (${KIND_LABEL[item.kind]}): ${result.error.slice(0, 200)}`,
        messageFr: `Échec de la publication automatique (${KIND_LABEL_FR[item.kind]})\u00a0: ${result.error.slice(0, 200)}`,
      });
      failed++;
    }
  }

  return { published, failed };
}

async function publishOne(
  item: PublishQueueItem,
): Promise<{ ok: true; ref?: string } | { ok: false; error: string }> {
  // Honor the schedule's destination. "local" means the user explicitly
  // opted out of any external integration — the item is theirs to copy
  // out of the queue. We don't error on it; we mark it as published
  // with a sentinel ref so the queue UI shows it's "ready to copy".
  let destination: string = "auto";
  if (item.scheduleId) {
    const [s] = await db
      .select()
      .from(dailySchedules)
      .where(eq(dailySchedules.id, item.scheduleId))
      .limit(1);
    const cfg = (s?.configJson ?? {}) as Record<string, unknown>;
    if (typeof cfg.destination === "string") destination = cfg.destination;
  }
  if (destination === "local") {
    return { ok: true, ref: "local:draft" };
  }

  if (item.kind === "blog_draft") {
    return publishBlog(item);
  }
  if (item.kind === "gbp_post") {
    return publishGbp(item);
  }
  if (item.kind === "social_post") {
    // No auto-OAuth path in v1. Approved social items stay approved as
    // a manual handoff; the queue page surfaces copy-to-clipboard.
    return {
      ok: false,
      error:
        "Social auto-post not configured. Set destination to 'local' on the schedule to silence this and use copy/paste.",
    };
  }
  if (item.kind === "internal_checklist") {
    return publishChecklist(item);
  }
  return { ok: false, error: `Unknown kind: ${item.kind}` };
}

async function publishBlog(
  item: PublishQueueItem,
): Promise<{ ok: true; ref?: string } | { ok: false; error: string }> {
  const { getClientWpCreds, createWpPost } = await import("./wp-bridge");
  const creds = await getClientWpCreds(item.clientId);
  if (!creds) {
    return {
      ok: false,
      error: "WordPress not connected for this client. Set it up under Settings → WordPress.",
    };
  }
  const payload = (item.payloadJson ?? {}) as {
    metaDescription?: string;
    excerpt?: string;
  };
  // Look up the schedule to decide draft vs publish. If the schedule is
  // gone (orphaned queue item), default to draft — safer.
  let status: "draft" | "publish" = "draft";
  if (item.scheduleId) {
    const [s] = await db
      .select()
      .from(dailySchedules)
      .where(eq(dailySchedules.id, item.scheduleId))
      .limit(1);
    if (s?.autoPublish) status = "publish";
  }
  const r = await createWpPost(creds, {
    title: item.title ?? "Untitled",
    content: item.body ?? "",
    excerpt: payload.excerpt,
    metaDescription: payload.metaDescription,
    status,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ref: r.url };
}

async function publishGbp(
  item: PublishQueueItem,
): Promise<{ ok: true; ref?: string } | { ok: false; error: string }> {
  // Location name comes from the schedule's configJson — set once when
  // the user creates the schedule. Keeps the clients table unchanged
  // (no new column for this v1).
  let locationName: string | null = null;
  if (item.scheduleId) {
    const [s] = await db
      .select()
      .from(dailySchedules)
      .where(eq(dailySchedules.id, item.scheduleId))
      .limit(1);
    const cfg = (s?.configJson ?? {}) as Record<string, unknown>;
    if (typeof cfg.gbp_location_name === "string") {
      locationName = cfg.gbp_location_name;
    }
  }
  if (!locationName) {
    return {
      ok: false,
      error:
        "GBP location not set on the schedule. Edit the schedule and pick a location.",
    };
  }
  const { createGbpLocalPost } = await import("./gbp-api");
  const payload = (item.payloadJson ?? {}) as {
    callToAction?: string | null;
    postType?: string;
    /** Product posts: the button opens the product page… */
    ctaUrl?: string | null;
    /** …and the post shows the product's photo. */
    mediaUrl?: string | null;
  };
  const httpsUrl = (u: string | null | undefined) =>
    typeof u === "string" && /^https?:\/\//i.test(u) ? u : undefined;
  const ctaUrl = httpsUrl(payload.ctaUrl);
  const cta =
    payload.callToAction && payload.callToAction !== ""
      ? {
          actionType: payload.callToAction as
            | "BOOK"
            | "ORDER"
            | "SHOP"
            | "LEARN_MORE"
            | "SIGN_UP"
            | "CALL",
          ...(payload.callToAction !== "CALL" && ctaUrl ? { url: ctaUrl } : {}),
        }
      : undefined;
  const r = await createGbpLocalPost({
    locationName,
    summary: item.body ?? "",
    callToAction: cta,
    mediaUrl: httpsUrl(payload.mediaUrl),
    clientIdScope: item.clientId,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ref: r.postName };
}

async function publishChecklist(
  item: PublishQueueItem,
): Promise<{ ok: true; ref?: string } | { ok: false; error: string }> {
  const payload = (item.payloadJson ?? {}) as {
    items?: { title: string; why?: string }[];
  };
  const items = payload.items ?? [];
  if (items.length === 0) {
    return { ok: false, error: "No checklist items in payload." };
  }
  const rows = items.map((i) => ({
    clientId: item.clientId,
    title: i.title.slice(0, 200),
    whyItMatters: (i.why ?? "").slice(0, 500),
    priority: "medium" as const,
    status: "todo" as const,
  }));
  await db.insert(tasks).values(rows);
  return { ok: true, ref: `${items.length} tasks` };
}
