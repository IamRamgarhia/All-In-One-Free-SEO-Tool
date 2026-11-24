"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients } from "@/db/schema";
import { accountsEnabled, canEdit, canSeeClient, currentUser } from "@/lib/auth";
import {
  createPost,
  deletePost,
  getPost,
  getStyleProfile,
  listPosts,
  saveKeywordResearch,
  setStyleProfile,
  updatePost,
} from "@/lib/content-studio/store";
import { planDates, statusForDate } from "@/lib/content-studio/publishing";
import { trainBrandVoice } from "@/lib/content-studio/seo/brand-voice";
import { randomBytes } from "node:crypto";
import { classifyIntentByRules } from "@/lib/content-studio/seo/intent";
import { generateOutline } from "@/lib/content-studio/seo/outline";
import { writePost } from "@/lib/content-studio/seo/writer";
import { generateMeta } from "@/lib/content-studio/seo/meta";
import { research } from "@/lib/content-studio/seo/research";
import { scoreDraft, type ContentScoreReport } from "@/lib/content-studio/seo/content-score";
import { cachedCorpus, loadCorpus } from "@/lib/content-studio/corpus-cache";
import { outlineToText, textToOutline } from "@/lib/content-studio/outline-text";
import { repurposeSocial } from "@/lib/content-studio/seo/social";
import { generateNewsletter } from "@/lib/content-studio/seo/newsletter";
import { buildPaaTree, type PaaNode } from "@/lib/content-studio/seo/paa-tree";
import { scoreTopicAuthority, type TopicAuthorityResult } from "@/lib/content-studio/seo/topic-authority";
import { refreshPost } from "@/lib/content-studio/seo/refresher";
import { articleSlug, buildArticleSchema, toExportPost } from "@/lib/content-studio/article-export";
import { markdownToHtml } from "@/lib/content-studio/exports/common";
import type { ContentPost } from "@/lib/content-studio/store";
import { createWpPost, getClientWpCreds, setPostSeo } from "@/lib/wp-bridge";
import { logActivity } from "@/lib/activity";
import type { KeywordSuggestion, NewsletterPack, Outline, SocialPack, StyleProfile } from "@/lib/content-studio/types";

/**
 * Server actions behind the writing studio (/content).
 *
 * Errors come back as codes, not sentences: the pages are translated and
 * the action does not know the reader's language. Each code has a string
 * under `content.errors` in both message files.
 *
 * @ai-partial — keyword ideas and the top-10 score never touch a model;
 * without a key the outline and article come back as skeletons.
 */
export type ContentError =
  | "readOnly"
  | "notFound"
  | "invalid"
  | "noOutline"
  | "noDraft"
  | "noWordPress"
  | "noSamples"
  | "fetchFailed"
  | "failed";
type Fail = { ok: false; error: ContentError };

const ids = z.object({
  clientId: z.coerce.number().int().positive(),
  postId: z.coerce.number().int().positive(),
});

/** Can the current user change this client's articles? */
async function guard(clientId: number): Promise<ContentError | null> {
  const me = await currentUser();
  // Null is also what a revoked session gives once accounts exist; only a
  // solo install (no accounts) may act without a user.
  if (!me && accountsEnabled()) return "notFound";
  if (me && !canEdit(me.role)) return "readOnly";
  if (!(await canSeeClient(me, clientId))) return "notFound";
  return null;
}

async function clientInfo(clientId: number) {
  const [row] = await db
    .select({ name: clients.name, url: clients.url, language: clients.language })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  return row ? { ...row, language: row.language || "en" } : null;
}

const postPath = (clientId: number, postId: number) => `/content/c/${clientId}/p/${postId}`;

// ---------------------------------------------------------------------------
// Keyword ideas and new articles
// ---------------------------------------------------------------------------

export type ResearchState =
  | { ok: true; seed: string; suggested: KeywordSuggestion[]; paa: string[] }
  | Fail;

export async function researchKeywords(input: { clientId: number; seed: string }): Promise<ResearchState> {
  await requireSignedIn();
  const parsed = z
    .object({ clientId: z.coerce.number().int().positive(), seed: z.string().trim().min(2).max(120) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, seed } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const client = await clientInfo(clientId);
  if (!client) return { ok: false, error: "notFound" };

  try {
    const result = await research(seed, client.language);
    await saveKeywordResearch(clientId, client.language, result);
    return { ok: true, seed, suggested: result.suggested, paa: result.paa };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type CreateState = Fail | null;

export async function createArticle(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requireSignedIn();
  const parsed = z
    .object({
      clientId: z.coerce.number().int().positive(),
      keyword: z.string().trim().min(2).max(120),
      title: z.string().trim().max(200).optional(),
    })
    .safeParse({
      clientId: formData.get("clientId"),
      keyword: formData.get("keyword"),
      title: formData.get("title") || undefined,
    });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, keyword, title } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };

  const post = await createPost(clientId, {
    status: "idea",
    title: title || keyword,
    primaryKeyword: keyword,
    intent: classifyIntentByRules(keyword).intent,
  });
  revalidatePath(`/content/c/${clientId}`);
  redirect(postPath(clientId, post.id));
}

export async function deleteArticle(input: { clientId: number; postId: number }): Promise<Fail | null> {
  await requireSignedIn();
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  await deletePost(clientId, postId);
  revalidatePath(`/content/c/${clientId}`);
  redirect(`/content/c/${clientId}`);
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export type OutlineState = { ok: true; outlineText: string; approved: boolean } | Fail;

export async function generateArticleOutline(input: { clientId: number; postId: number }): Promise<OutlineState> {
  await requireSignedIn();
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const [post, client, style] = await Promise.all([
    getPost(clientId, postId),
    clientInfo(clientId),
    getStyleProfile(clientId),
  ]);
  if (!post || !client) return { ok: false, error: "notFound" };

  const keyword = post.primaryKeyword ?? post.title ?? "";
  const intent = classifyIntentByRules(keyword);
  try {
    const outline = await generateOutline({
      title: post.title ?? keyword,
      primary_keyword: keyword,
      intent: post.intent ?? intent.intent,
      format: intent.recommended_format,
      client_style_profile: style ?? undefined,
      language: client.language,
    });
    // A new outline means the old approval no longer applies.
    await updatePost(clientId, postId, {
      outline,
      status: post.status === "outline_approved" ? "idea" : post.status,
    });
    revalidatePath(postPath(clientId, postId));
    return { ok: true, outlineText: outlineToText(outline), approved: false };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function saveArticleOutline(input: {
  clientId: number;
  postId: number;
  text: string;
  approve: boolean;
}): Promise<OutlineState> {
  await requireSignedIn();
  const parsed = ids
    .extend({ text: z.string().max(20_000), approve: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId, text, approve } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const post = await getPost(clientId, postId);
  if (!post) return { ok: false, error: "notFound" };

  const base: Outline = post.outline ?? emptyOutline(post.title ?? post.primaryKeyword ?? "");
  const outline = textToOutline(text, base);
  if (outline.h2s.length === 0) return { ok: false, error: "noOutline" };

  // Approving only moves an article forward: a draft stays a draft.
  const status = approve && post.status === "idea" ? "outline_approved" : post.status;
  await updatePost(clientId, postId, { outline, status });
  revalidatePath(postPath(clientId, postId));
  return { ok: true, outlineText: outlineToText(outline), approved: status !== "idea" };
}

function emptyOutline(title: string): Outline {
  return {
    title,
    slug: "",
    tldr_bullets: [],
    intro_hook: "",
    h2s: [],
    faqs: [],
    conclusion_cta: "",
    internal_link_topics: [],
    image_suggestions: [],
    word_count_target: 1500,
  };
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

export type DraftState =
  | { ok: true; draftMarkdown: string; metaTitle: string; metaDescription: string }
  | Fail;

export async function writeArticleDraft(input: { clientId: number; postId: number }): Promise<DraftState> {
  await requireSignedIn();
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const [post, client, style] = await Promise.all([
    getPost(clientId, postId),
    clientInfo(clientId),
    getStyleProfile(clientId),
  ]);
  if (!post || !client) return { ok: false, error: "notFound" };
  if (!post.outline || post.outline.h2s.length === 0) return { ok: false, error: "noOutline" };

  const keyword = post.primaryKeyword ?? post.title ?? "";
  try {
    const draftMarkdown = await writePost({
      outline: post.outline,
      primary_keyword: keyword,
      style: style ?? { language: client.language },
      language: client.language,
    });
    const meta = await generateMeta({
      title: post.title ?? post.outline.title ?? keyword,
      primary_keyword: keyword,
      intent: post.intent ?? classifyIntentByRules(keyword).intent,
      intro: draftMarkdown.slice(0, 800),
      brand: client.name,
      language: client.language,
    });
    await updatePost(clientId, postId, {
      draftMarkdown,
      metaTitle: meta.metaTitle,
      metaDescription: meta.metaDescription,
      status: post.status === "idea" || post.status === "outline_approved" ? "draft" : post.status,
    });
    revalidatePath(postPath(clientId, postId));
    return { ok: true, draftMarkdown, metaTitle: meta.metaTitle, metaDescription: meta.metaDescription };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function saveArticleDraft(input: {
  clientId: number;
  postId: number;
  title: string;
  draftMarkdown: string;
  metaTitle: string;
  metaDescription: string;
}): Promise<{ ok: true; savedAt: number } | Fail> {
  await requireSignedIn();
  const parsed = ids
    .extend({
      title: z.string().trim().max(200),
      draftMarkdown: z.string().max(200_000),
      metaTitle: z.string().trim().max(200),
      metaDescription: z.string().trim().max(400),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId, ...fields } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const row = await updatePost(clientId, postId, {
    title: fields.title || null,
    draftMarkdown: fields.draftMarkdown,
    metaTitle: fields.metaTitle || null,
    metaDescription: fields.metaDescription || null,
  });
  if (!row) return { ok: false, error: "notFound" };
  revalidatePath(`/content/c/${clientId}`);
  return { ok: true, savedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

export type ScoreState =
  | { ok: true; report: ContentScoreReport | null }
  | Fail;

/**
 * Score a draft against the top 10 for its keyword.
 *
 * `fetch: false` is the live path the editor calls while someone types:
 * it scores only when the corpus is already cached and otherwise answers
 * `report: null`, so a keystroke never starts a 20-second download. The
 * explicit "analyse" button passes `fetch: true`.
 */
export async function scoreArticle(input: {
  clientId: number;
  postId: number;
  markdown: string;
  fetch: boolean;
  refresh?: boolean;
}): Promise<ScoreState> {
  await requireSignedIn();
  const parsed = ids
    .extend({ markdown: z.string().max(200_000), fetch: z.boolean(), refresh: z.boolean().optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId, markdown } = parsed.data;
  const me = await currentUser();
  if (!(await canSeeClient(me, clientId))) return { ok: false, error: "notFound" };
  const [post, client] = await Promise.all([getPost(clientId, postId), clientInfo(clientId)]);
  if (!post || !client) return { ok: false, error: "notFound" };
  const keyword = post.primaryKeyword ?? post.title ?? "";
  if (!keyword) return { ok: false, error: "invalid" };

  try {
    const ctx = parsed.data.fetch
      ? await loadCorpus(keyword, client.language, parsed.data.refresh)
      : cachedCorpus(keyword, client.language);
    if (!ctx) return { ok: true, report: null };
    const headings = markdown
      .split(/\r?\n/)
      .filter((l) => /^#{1,4}\s/.test(l))
      .map((l) => l.replace(/^#+\s+/, "").trim());
    const report = scoreDraft(markdown, headings, ctx);
    // Only an editor's score is kept: a viewer looking at the page should
    // not change what the article list shows.
    // The score is stored only for the draft that was scored: a slow
    // request for older text must not overwrite a newer draft's score.
    if (
      !report.insufficient_data &&
      report.score !== post.contentScore &&
      markdown === (post.draftMarkdown ?? "") &&
      (!me || canEdit(me.role))
    ) {
      await updatePost(clientId, postId, { contentScore: report.score });
    }
    return { ok: true, report };
  } catch {
    return { ok: false, error: "failed" };
  }
}

// ---------------------------------------------------------------------------
// Distribution: schema, social posts, newsletter, WordPress
// ---------------------------------------------------------------------------

type Loaded = {
  clientId: number;
  postId: number;
  post: ContentPost;
  client: NonNullable<Awaited<ReturnType<typeof clientInfo>>>;
};

async function loadForDistribution(input: { clientId: number; postId: number }): Promise<Loaded | { error: ContentError }> {
  const parsed = ids.safeParse(input);
  if (!parsed.success) return { error: "invalid" };
  const { clientId, postId } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { error: denied };
  const [post, client] = await Promise.all([getPost(clientId, postId), clientInfo(clientId)]);
  if (!post || !client) return { error: "notFound" };
  if (!post.draftMarkdown?.trim()) return { error: "noDraft" };
  return { clientId, postId, post, client };
}

/** First paragraph of the draft, for the generators' "intro" input. */
function introOf(markdown: string): string {
  const para = markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("- "));
  return (para ?? markdown).slice(0, 800);
}

/** Where the article lives, or will: the published URL, else a guess from the slug. */
function articleUrl(post: ContentPost, client: { url: string }): string {
  if (post.publishedUrl) return post.publishedUrl;
  try {
    return new URL(`/blog/${articleSlug(post)}`, client.url).toString();
  } catch {
    return client.url;
  }
}

export type SchemaState = { ok: true; schemaJsonLd: string } | Fail;

export async function buildSchemaForArticle(input: { clientId: number; postId: number }): Promise<SchemaState> {
  await requireSignedIn();
  const ctx = await loadForDistribution(input);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const schemaJsonLd = buildArticleSchema({ ...ctx.post, schemaJsonLd: null }, ctx.client);
  await updatePost(ctx.clientId, ctx.postId, { schemaJsonLd });
  return { ok: true, schemaJsonLd };
}

export type SocialState = { ok: true; social: SocialPack } | Fail;

export async function generateSocialPosts(input: { clientId: number; postId: number }): Promise<SocialState> {
  await requireSignedIn();
  const ctx = await loadForDistribution(input);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { post, client } = ctx;
  try {
    const social = await repurposeSocial({
      title: post.title ?? post.primaryKeyword ?? "",
      primary_keyword: post.primaryKeyword ?? "",
      intro: introOf(post.draftMarkdown ?? ""),
      tldr_bullets: post.outline?.tldr_bullets ?? [],
      conclusion_cta: post.outline?.conclusion_cta ?? "",
      url: articleUrl(post, client),
      brand_voice: (await getStyleProfile(ctx.clientId)) ?? undefined,
      language: client.language,
    });
    await updatePost(ctx.clientId, ctx.postId, { social });
    return { ok: true, social };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type NewsletterState = { ok: true; newsletter: NewsletterPack } | Fail;

export async function generateNewsletterExcerpt(input: { clientId: number; postId: number }): Promise<NewsletterState> {
  await requireSignedIn();
  const ctx = await loadForDistribution(input);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const { post, client } = ctx;
  try {
    const newsletter = await generateNewsletter({
      title: post.title ?? post.primaryKeyword ?? "",
      primary_keyword: post.primaryKeyword ?? "",
      intro: introOf(post.draftMarkdown ?? ""),
      url: articleUrl(post, client),
      language: client.language,
    });
    await updatePost(ctx.clientId, ctx.postId, { newsletter });
    return { ok: true, newsletter };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type PublishState =
  | { ok: true; url: string; status: ContentPost["status"] }
  | Fail
  | { ok: false; error: "wordpress"; detail: string };

/**
 * Send the article to the client's WordPress through the bridge plugin.
 *
 * `draft` lands it in WP admin for a last look, which is the default the
 * daily-automation publisher uses too; `publish` puts it live. The SEO
 * title goes in a second call because the plugin's create route has no
 * field for it; that call failing leaves a post whose only fault is the
 * title tag, so it does not undo the first.
 */
export async function publishToWordPress(input: {
  clientId: number;
  postId: number;
  mode: "draft" | "publish";
}): Promise<PublishState> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_content_actions");
  const ctx = await loadForDistribution(input);
  if ("error" in ctx) return { ok: false, error: ctx.error };
  const mode = input.mode === "publish" ? "publish" : "draft";
  const creds = await getClientWpCreds(ctx.clientId);
  if (!creds) return { ok: false, error: "noWordPress" };

  const { post, client } = ctx;
  const exp = toExportPost(post, client);
  let schema: unknown = null;
  try {
    schema = JSON.parse(exp.schemaJsonLd);
  } catch {
    // Hand-edited into something that is not JSON: publish without it.
  }
  const created = await createWpPost(creds, {
    title: exp.title,
    content: markdownToHtml(exp.draftMarkdown),
    excerpt: exp.metaDescription,
    metaDescription: exp.metaDescription,
    schemaJsonLd: schema,
    status: mode,
  });
  if (!created.ok) return { ok: false, error: "wordpress", detail: created.error };
  if (post.metaTitle) await setPostSeo(creds, created.id, { title: post.metaTitle }).catch(() => null);

  // A WordPress draft is not live yet: the article keeps its status and
  // no published URL until someone publishes it (here or in WP admin).
  const status: ContentPost["status"] = mode === "publish" ? "published" : post.status;
  if (mode === "publish") {
    const row = await updatePost(ctx.clientId, ctx.postId, {
      status,
      publishedUrl: created.url || null,
      publishDate: new Date(),
    });
    // Deleted here while WordPress was publishing: the post is live but has
    // nothing to attach to. Say so rather than report a clean success.
    if (!row) return { ok: false, error: "notFound" };
  }
  await logActivity({
    kind: "task.completed",
    message: `${mode === "publish" ? tx("published") : tx("sentAsAWordpressDraft")}: ${exp.title}`,
    level: "success",
    clientId: ctx.clientId,
    entityType: "content_post",
    entityId: ctx.postId,
  });
  revalidatePath(postPath(ctx.clientId, ctx.postId));
  return { ok: true, url: created.url, status };
}

/** For sites the bridge cannot reach (Hugo, Ghost, Webflow...): record where it went live. */
export async function markArticlePublished(input: {
  clientId: number;
  postId: number;
  url: string;
}): Promise<{ ok: true } | Fail> {
  await requireSignedIn();
  const parsed = ids.extend({ url: z.httpUrl().max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId, url } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const row = await updatePost(clientId, postId, { status: "published", publishedUrl: url, publishDate: new Date() });
  if (!row) return { ok: false, error: "notFound" };
  revalidatePath(postPath(clientId, postId));
  revalidatePath(`/content/c/${clientId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Tools: question tree, topic coverage, refreshing an existing page
// ---------------------------------------------------------------------------

const seedInput = z.object({
  clientId: z.coerce.number().int().positive(),
  seed: z.string().trim().min(2).max(120),
});

export type QuestionTreeState = { ok: true; tree: PaaNode } | Fail;

/** People-also-ask, followed a few levels down, in the client's language. */
export async function exploreQuestions(input: { clientId: number; seed: string }): Promise<QuestionTreeState> {
  await requireSignedIn();
  const parsed = seedInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, seed } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const client = await clientInfo(clientId);
  if (!client) return { ok: false, error: "notFound" };
  try {
    return { ok: true, tree: await buildPaaTree(seed, { lang: client.language, maxDepth: 2, totalQuestionsCap: 30 }) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export type TopicCoverageState = { ok: true; result: TopicAuthorityResult } | Fail;

/**
 * How much of a topic the client's articles cover, using the matching
 * Wikipedia article's sections and links as the list of sub-topics.
 */
export async function measureTopicCoverage(input: { clientId: number; seed: string }): Promise<TopicCoverageState> {
  await requireSignedIn();
  const parsed = seedInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, seed } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const client = await clientInfo(clientId);
  if (!client) return { ok: false, error: "notFound" };
  const posts = await listPosts(clientId);
  const text = posts.map((p) => `${p.title ?? ""}\n${p.primaryKeyword ?? ""}\n${p.draftMarkdown ?? ""}`).join("\n\n");
  try {
    return { ok: true, result: await scoreTopicAuthority(seed, text, client.language) };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * Fetch a page that is already live, have it rewritten to be current, and
 * save the result as a new article to review. The live page is untouched.
 */
export async function refreshFromUrl(_prev: CreateState, formData: FormData): Promise<CreateState> {
  await requireSignedIn();
  const parsed = z
    .object({ clientId: z.coerce.number().int().positive(), url: z.httpUrl().max(500) })
    .safeParse({ clientId: formData.get("clientId"), url: formData.get("url") });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, url } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const client = await clientInfo(clientId);
  if (!client) return { ok: false, error: "notFound" };

  let refreshed: Awaited<ReturnType<typeof refreshPost>>;
  try {
    refreshed = await refreshPost(url, client.language);
  } catch {
    return { ok: false, error: "fetchFailed" };
  }
  const title = refreshed.original_title.slice(0, 200);
  const post = await createPost(clientId, {
    status: "draft",
    title,
    primaryKeyword: title.slice(0, 120),
    intent: classifyIntentByRules(title).intent,
    draftMarkdown: refreshed.refreshed_markdown,
    metaTitle: refreshed.meta_title || null,
    metaDescription: refreshed.meta_description || null,
    publishedUrl: url,
  });
  revalidatePath(`/content/c/${clientId}`);
  redirect(postPath(clientId, post.id));
}

// ---------------------------------------------------------------------------
// Publishing: calendar, brand voice, review link
// ---------------------------------------------------------------------------

const calendarPath = (clientId: number) => `/content/c/${clientId}/calendar`;

/** Set or clear an article's publication date. `date` is YYYY-MM-DD, or "" to clear. */
export async function setArticleDate(input: {
  clientId: number;
  postId: number;
  date: string;
}): Promise<{ ok: true } | Fail> {
  await requireSignedIn();
  const parsed = ids
    .extend({ date: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId, date } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const post = await getPost(clientId, postId);
  if (!post) return { ok: false, error: "notFound" };
  // 09:00 UTC, like the automatic spread: a date, not a moment.
  const publishDate = date ? new Date(`${date}T09:00:00Z`) : null;
  if (publishDate && Number.isNaN(publishDate.getTime())) return { ok: false, error: "invalid" };
  await updatePost(clientId, postId, {
    publishDate,
    status: statusForDate(post.status, publishDate !== null),
  });
  revalidatePath(calendarPath(clientId));
  revalidatePath(`/content/c/${clientId}`);
  return { ok: true };
}

/** Give a date to every article that has none, on the best days for the project's niche. */
export async function autoScheduleArticles(input: {
  clientId: number;
}): Promise<{ ok: true; planned: number } | Fail> {
  await requireSignedIn();
  const parsed = z.object({ clientId: z.coerce.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const [[client], posts] = await Promise.all([
    db.select({ niche: clients.niche }).from(clients).where(eq(clients.id, clientId)).limit(1),
    listPosts(clientId),
  ]);
  if (!client) return { ok: false, error: "notFound" };
  const plan = planDates(
    posts.map((p) => ({ id: p.id, title: p.title ?? "", status: p.status, publishDate: p.publishDate })),
    { niche: client.niche, now: new Date() },
  );
  for (const item of plan) {
    const post = posts.find((p) => p.id === item.id)!;
    await updatePost(clientId, item.id, { publishDate: item.date, status: statusForDate(post.status, true) });
  }
  revalidatePath(calendarPath(clientId));
  revalidatePath(`/content/c/${clientId}`);
  return { ok: true, planned: plan.length };
}

export type VoiceState = { ok: true; profile: StyleProfile | null } | Fail;

/**
 * Learn the client's voice from texts they wrote. With no samples given,
 * the project's own written articles are used. Without an AI key the
 * profile comes from counting (sentence length, person, headings).
 */
export async function trainClientVoice(input: { clientId: number; samples: string }): Promise<VoiceState> {
  await requireSignedIn();
  const parsed = z
    .object({ clientId: z.coerce.number().int().positive(), samples: z.string().max(60_000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  // Samples are separated by a line of three or more dashes.
  let samples = parsed.data.samples
    .split(/\n\s*-{3,}\s*\n/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 200);
  if (samples.length === 0) {
    samples = (await listPosts(clientId))
      .map((p) => p.draftMarkdown?.trim() ?? "")
      .filter((x) => x.length >= 200)
      .slice(0, 3);
  }
  if (samples.length === 0) return { ok: false, error: "noSamples" };
  try {
    const profile = await trainBrandVoice(samples.map((x) => x.slice(0, 12_000)));
    await setStyleProfile(clientId, profile);
    revalidatePath(`/content/c/${clientId}/voice`);
    return { ok: true, profile };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Forget the client's voice: articles go back to the default style. */
export async function resetClientVoice(input: { clientId: number }): Promise<VoiceState> {
  await requireSignedIn();
  const parsed = z.object({ clientId: z.coerce.number().int().positive() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const denied = await guard(parsed.data.clientId);
  if (denied) return { ok: false, error: denied };
  await setStyleProfile(parsed.data.clientId, null);
  revalidatePath(`/content/c/${parsed.data.clientId}/voice`);
  return { ok: true, profile: null };
}

/**
 * Send an article to the client for approval in their portal (again
 * after an edit), or close the review.
 * Returns the path of the review page. The portal link is created when
 * the project has none yet: the article is read through it.
 */
export async function setArticleReview(input: {
  clientId: number;
  postId: number;
  shared: boolean;
}): Promise<{ ok: true; path: string | null } | Fail> {
  await requireSignedIn();
  const parsed = ids.extend({ shared: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { clientId, postId, shared } = parsed.data;
  const denied = await guard(clientId);
  if (denied) return { ok: false, error: denied };
  const post = await getPost(clientId, postId);
  if (!post) return { ok: false, error: "notFound" };
  if (shared && !post.draftMarkdown?.trim()) return { ok: false, error: "noDraft" };

  let path: string | null = null;
  if (shared) {
    const [client] = await db
      .select({ shareToken: clients.shareToken })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);
    if (!client) return { ok: false, error: "notFound" };
    let token = client.shareToken;
    if (!token) {
      token = randomBytes(24).toString("base64url");
      await db.update(clients).set({ shareToken: token, updatedAt: new Date() }).where(eq(clients.id, clientId));
      revalidatePath(`/clients/${clientId}`);
    }
    path = `/portal/${token}/articles/${postId}`;
  }
  // Sending (again) asks the client for a fresh answer: the previous one
  // was about an earlier version. Closing the review keeps the answer.
  await updatePost(
    clientId,
    postId,
    shared
      ? { reviewSharedAt: new Date(), clientDecision: null, clientComment: null, clientDecidedAt: null }
      : { reviewSharedAt: null },
  );
  revalidatePath(postPath(clientId, postId));
  return { ok: true, path };
}
