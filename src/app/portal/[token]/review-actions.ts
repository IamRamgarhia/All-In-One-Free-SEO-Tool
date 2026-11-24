"use server";

import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db/client";
import { clients, contentPosts, publishQueue } from "@/db/schema";
import { REVIEW_COMMENT_MAX } from "./review-data";

export type ReviewDecisionResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "notFound" | "answered" | "comment" };

const argsSchema = z.object({
  token: z.string().min(16).max(200),
  id: z.number().int().positive(),
  decision: z.enum(["approved", "changes"]),
  comment: z.string().max(REVIEW_COMMENT_MAX).optional(),
});

type Args = z.infer<typeof argsSchema>;

/**
 * Check what the browser sent, and find the client the link belongs to.
 * A request for changes needs a comment: it is what the agency acts on.
 */
async function parse(raw: unknown): Promise<
  | { ok: true; args: Omit<Args, "comment"> & { comment: string | null }; client: { id: number; name: string } }
  | { ok: false; error: "invalid" | "notFound" | "comment" }
> {
  const parsed = argsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const args = parsed.data;
  // Only a request for changes carries a comment.
  const comment = args.decision === "changes" ? args.comment?.trim() || null : null;
  if (args.decision === "changes" && !comment) return { ok: false, error: "comment" };

  const [client] = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.shareToken, args.token))
    .limit(1);
  if (!client) return { ok: false, error: "notFound" };
  return { ok: true, args: { ...args, comment }, client };
}

/** Tell the agency; a webhook that is down must not undo the answer. */
async function tellAgency(clientName: string, title: string, decision: Args["decision"], comment: string | null) {
  try {
    const { notify } = await import("@/lib/notifier");
    const t = await getTranslations("portal.review");
    await notify({
      title:
        decision === "approved"
          ? t("notifyApproved", { client: clientName })
          : t("notifyChanges", { client: clientName }),
      body: title,
      level: decision === "approved" ? "success" : "warning",
      fields: comment ? [{ label: t("notifyComment"), value: comment }] : undefined,
    });
  } catch {
    // Nothing to do: the answer is saved and shows in the app.
  }
}

/**
 * The client answers a draft from the publishing queue that the agency
 * sent them. Approving it hands it to the publisher (status "approved"),
 * as approving it in the app would; asking for changes leaves it with
 * the agency, with the comment.
 */
export async function decideQueueItem(
  token: string,
  itemId: number,
  decision: "approved" | "changes",
  comment?: string,
): Promise<ReviewDecisionResult> {
  const p = await parse({ token, id: itemId, decision, comment });
  if (!p.ok) return p;
  const { client, args } = p;

  // Only an item of this client that was sent to them.
  const [item] = await db
    .select()
    .from(publishQueue)
    .where(
      and(
        eq(publishQueue.id, args.id),
        eq(publishQueue.clientId, client.id),
        isNotNull(publishQueue.clientSharedAt),
      ),
    )
    .limit(1);
  if (!item) return { ok: false, error: "notFound" };
  if (item.clientDecision || item.status !== "pending_review") return { ok: false, error: "answered" };

  // Conditional: two clicks, or the agency settling the item at the same
  // moment, record one answer.
  const now = new Date();
  const updated = await db
    .update(publishQueue)
    .set({
      clientDecision: args.decision,
      clientComment: args.comment,
      clientDecidedAt: now,
      ...(args.decision === "approved" ? { status: "approved" as const } : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(publishQueue.id, item.id),
        eq(publishQueue.clientId, client.id),
        eq(publishQueue.status, "pending_review"),
        isNull(publishQueue.clientDecision),
      ),
    )
    .returning({ id: publishQueue.id });
  if (updated.length === 0) return { ok: false, error: "answered" };

  await tellAgency(client.name, item.title ?? "", args.decision, args.comment);
  revalidatePath(`/portal/${args.token}`);
  revalidatePath(`/clients/${client.id}/queue`);
  return { ok: true };
}

/**
 * The client answers an article the agency sent them for approval.
 * Approving it publishes nothing: the agency sees the answer and
 * schedules the article.
 */
export async function decideArticle(
  token: string,
  postId: number,
  decision: "approved" | "changes",
  comment?: string,
): Promise<ReviewDecisionResult> {
  const p = await parse({ token, id: postId, decision, comment });
  if (!p.ok) return p;
  const { client, args } = p;

  const [post] = await db
    .select()
    .from(contentPosts)
    .where(
      and(
        eq(contentPosts.id, args.id),
        eq(contentPosts.clientId, client.id),
        isNotNull(contentPosts.reviewSharedAt),
      ),
    )
    .limit(1);
  if (!post) return { ok: false, error: "notFound" };
  if (post.clientDecision || post.status === "published") return { ok: false, error: "answered" };

  const now = new Date();
  const updated = await db
    .update(contentPosts)
    .set({
      clientDecision: args.decision,
      clientComment: args.comment,
      clientDecidedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(contentPosts.id, post.id),
        eq(contentPosts.clientId, client.id),
        isNotNull(contentPosts.reviewSharedAt),
        ne(contentPosts.status, "published"),
        isNull(contentPosts.clientDecision),
      ),
    )
    .returning({ id: contentPosts.id });
  if (updated.length === 0) return { ok: false, error: "answered" };

  await tellAgency(client.name, post.title ?? post.primaryKeyword ?? "", args.decision, args.comment);
  revalidatePath(`/portal/${args.token}`);
  revalidatePath(`/portal/${args.token}/articles/${post.id}`);
  revalidatePath(`/content/c/${client.id}/p/${post.id}`);
  return { ok: true };
}
