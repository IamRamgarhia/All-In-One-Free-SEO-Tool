"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { clients, contentBriefs } from "@/db/schema";
import {
  writeBlogPost,
  type BlogWriteRequest,
} from "@/lib/blog-writer";
import { getGscTopQueries } from "@/lib/google-data";
import { logActivity } from "@/lib/activity";

const inputSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  targetKeyword: z.string().trim().min(2, "Target keyword is required"),
  supportingKeywords: z.string().trim().optional(),
  tone: z.enum(["professional", "casual", "authoritative", "friendly"]).default(
    "professional",
  ),
  audienceLevel: z.enum(["beginner", "intermediate", "expert"]).default(
    "intermediate",
  ),
  wordCount: z.coerce
    .number()
    .refine((n) => [800, 1200, 1500, 2000].includes(n))
    .default(1200),
  notes: z.string().trim().max(1000).optional(),
});

export type GenerateBlogResult =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

export async function generateBlogPost(opts: {
  clientId: number;
  targetKeyword: string;
  supportingKeywords?: string;
  tone?: BlogWriteRequest["tone"];
  audienceLevel?: BlogWriteRequest["audienceLevel"];
  wordCount?: BlogWriteRequest["wordCount"];
  notes?: string;
}): Promise<GenerateBlogResult> {
  const parsed = inputSchema.safeParse(opts);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, parsed.data.clientId))
    .limit(1);
  if (!client) return { ok: false, error: "Client not found" };

  // If GSC is linked, ground the post in real top-query data
  let topQueries: Awaited<ReturnType<typeof getGscTopQueries>> = [];
  if (client.gscProperty) {
    topQueries = await getGscTopQueries({
      siteUrl: client.gscProperty,
      days: 28,
      limit: 10,
    });
  }

  const supportingList = parsed.data.supportingKeywords
    ? parsed.data.supportingKeywords
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const result = await writeBlogPost({
    clientId: client.id,
    clientName: client.name,
    clientUrl: client.url,
    niche: client.niche,
    description: client.description,
    techStack: client.techStack,
    targetKeyword: parsed.data.targetKeyword,
    supportingKeywords: supportingList,
    tone: parsed.data.tone,
    audienceLevel: parsed.data.audienceLevel,
    wordCount: parsed.data.wordCount as 800 | 1200 | 1500 | 2000,
    notes: parsed.data.notes,
    topQueries,
  });

  return result;
}

/**
 * Save the generated post as a content brief tied to this client. We slot
 * the markdown into the `notes` field and pull the title from the H1 line.
 */
export async function saveBlogDraft(opts: {
  clientId: number;
  targetKeyword: string;
  markdown: string;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  if (!opts.markdown.trim()) return { ok: false, error: "Empty content" };

  const titleMatch = opts.markdown.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : opts.targetKeyword;

  const [row] = await db
    .insert(contentBriefs)
    .values({
      clientId: opts.clientId,
      targetKeyword: opts.targetKeyword,
      title,
      status: "draft",
      notes: opts.markdown,
    })
    .returning({ id: contentBriefs.id });

  await logActivity({
    kind: "task.created",
    message: `Saved blog draft: ${title}`,
    level: "success",
    clientId: opts.clientId,
    entityType: "content_brief",
    entityId: row.id,
  });

  revalidatePath(`/blog/${opts.clientId}`);
  revalidatePath(`/clients/${opts.clientId}`);
  return { ok: true, id: row.id };
}

/**
 * Run plagiarism + AI-detection on a draft and return the verdict so the
 * editor can show it before the user hits "publish." Reuses the existing
 * /tools/plagiarism action — same prompt, same scoring, just exposed as
 * a publish-time gate instead of a separate tool surface.
 */
export async function checkBlogPlagiarism(opts: {
  clientId: number;
  markdown: string;
}): Promise<
  | {
      ok: true;
      aiLikelihood: number;
      originalityScore: number;
      verdict: string;
      flags: { snippet: string; reason: string }[];
    }
  | { ok: false; error: string }
> {
  if (!opts.markdown.trim()) return { ok: false, error: "Empty content" };
  // Strip markdown to plain text for cleaner detection
  const plain = opts.markdown
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{2,}/g, "\n");

  const { checkPlagiarism } = await import("@/app/tools/plagiarism/actions");
  const r = await checkPlagiarism({ content: plain });
  if (!r.ok) return r;
  return {
    ok: true,
    aiLikelihood: r.aiLikelihood,
    originalityScore: r.originalityScore,
    verdict: r.verdict,
    flags: r.flags,
  };
}
