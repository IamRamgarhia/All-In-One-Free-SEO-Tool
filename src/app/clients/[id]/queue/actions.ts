"use server";

import { actionTx } from "@/lib/action-tx";
import { requireSignedIn } from "@/lib/action-guard";
import { requireClientAccess } from "@/lib/auth";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, publishQueue } from "@/db/schema";

async function ownItem(itemId: number, clientId: number) {
  const [row] = await db
    .select()
    .from(publishQueue)
    .where(
      and(
        eq(publishQueue.id, itemId),
        eq(publishQueue.clientId, clientId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function approveQueueItem(
  itemId: number,
  clientId: number,
  edits?: { title?: string; body?: string },
): Promise<{ ok: boolean; message: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_queue_actions");
  const item = await ownItem(itemId, clientId);
  if (!item) return { ok: false, message: tx("queueItemNotFound") };
  if (item.status !== "pending_review") {
    return { ok: false, message: tx("noLongerPending") };
  }
  await db
    .update(publishQueue)
    .set({
      status: "approved",
      title: edits?.title ?? item.title,
      body: edits?.body ?? item.body,
      updatedAt: new Date(),
    })
    .where(eq(publishQueue.id, itemId));
  revalidatePath(`/clients/${clientId}/queue`);
  return {
    ok: true,
    message: tx("approvedPublishesOnTheNext"),
  };
}

/**
 * Approve + publish immediately. Best path for the user who wants to
 * see the end-to-end loop working today rather than waiting for the
 * next tick.
 */
export async function approveAndPublishNow(
  itemId: number,
  clientId: number,
  edits?: { title?: string; body?: string },
): Promise<{ ok: boolean; message: string }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_queue_actions");
  const item = await ownItem(itemId, clientId);
  if (!item) return { ok: false, message: tx("queueItemNotFound") };
  if (item.status === "published") {
    return { ok: false, message: tx("alreadyPublished") };
  }
  await db
    .update(publishQueue)
    .set({
      status: "approved",
      // "Publish now" means now, whatever date it was planned for: the
      // publisher only takes items that are due.
      scheduledFor: new Date(),
      title: edits?.title ?? item.title,
      body: edits?.body ?? item.body,
      updatedAt: new Date(),
    })
    .where(eq(publishQueue.id, itemId));
  const { tickQueuePublish } = await import("@/lib/daily-automations");
  const r = await tickQueuePublish();
  revalidatePath(`/clients/${clientId}/queue`);
  if (r.published > 0) return { ok: true, message: tx("published") };
  if (r.failed > 0) {
    // Re-read to surface the error message
    const [post] = await db
      .select()
      .from(publishQueue)
      .where(eq(publishQueue.id, itemId))
      .limit(1);
    return {
      ok: false,
      message: tx("publishFailed", { error: post?.errorMsg ?? tx("unknownError") }),
    };
  }
  return {
    ok: true,
    message:
      tx("approvedButNotPickedUp"),
  };
}

export async function rejectQueueItem(
  itemId: number,
  clientId: number,
  note?: string,
): Promise<void> {
  await requireSignedIn();
  await db
    .update(publishQueue)
    .set({
      status: "skipped",
      reviewNote: note?.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(publishQueue.id, itemId),
        eq(publishQueue.clientId, clientId),
      ),
    );
  revalidatePath(`/clients/${clientId}/queue`);
}

export async function deleteQueueItem(
  itemId: number,
  clientId: number,
): Promise<void> {
  await requireSignedIn();
  await db
    .delete(publishQueue)
    .where(
      and(
        eq(publishQueue.id, itemId),
        eq(publishQueue.clientId, clientId),
      ),
    );
  revalidatePath(`/clients/${clientId}/queue`);
}

/**
 * Send a draft to the client's portal for approval (or send it again
 * after an edit). The agency has read it first; the client then approves
 * it or asks for changes in /portal/<token>. Sending again clears the
 * previous answer. Approving directly from the queue stays possible at
 * any time.
 */
export async function sendQueueItemToClient(
  itemId: number,
  clientId: number,
  edits?: { title?: string; body?: string },
): Promise<{ ok: boolean; message: string; needsPortalLink?: boolean }> {
  await requireSignedIn();
  const tx = await actionTx("ui.app_clients_id_queue_actions");
  if (!Number.isInteger(itemId) || !Number.isInteger(clientId)) {
    return { ok: false, message: tx("queueItemNotFound") };
  }
  await requireClientAccess(clientId, { edit: true });
  const item = await ownItem(itemId, clientId);
  if (!item) return { ok: false, message: tx("queueItemNotFound") };
  if (item.status !== "pending_review") {
    return { ok: false, message: tx("noLongerPending") };
  }
  // The daily checklist is a note for the agency, not something to publish.
  if (item.kind === "internal_checklist") {
    return { ok: false, message: tx("notForClient") };
  }
  const [client] = await db
    .select({ shareToken: clients.shareToken })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client?.shareToken) {
    return { ok: false, message: tx("noPortalLink"), needsPortalLink: true };
  }
  await db
    .update(publishQueue)
    .set({
      title: edits?.title ?? item.title,
      body: edits?.body ?? item.body,
      clientSharedAt: new Date(),
      clientDecision: null,
      clientComment: null,
      clientDecidedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(publishQueue.id, itemId),
        eq(publishQueue.clientId, clientId),
        eq(publishQueue.status, "pending_review"),
      ),
    );
  revalidatePath(`/clients/${clientId}/queue`);
  revalidatePath(`/portal/${client.shareToken}`);
  return {
    ok: true,
    message: item.clientSharedAt ? tx("sentAgainToClient") : tx("sentToClient"),
  };
}

/**
 * A blog draft as a .md file: frontmatter (title, description, slug, date,
 * keywords) and, for the "for AI" variant, a brief telling another AI how
 * to enrich it. The file's words follow the article's language, not the
 * interface's.
 */
export async function exportBlogMarkdown(
  itemId: number,
  clientId: number,
  forAi: boolean,
): Promise<{ ok: true; filename: string; content: string } | { ok: false; message: string }> {
  await requireSignedIn();
  await requireClientAccess(clientId);
  const tx = await actionTx("ui.app_clients_id_queue_actions");
  const item = await ownItem(itemId, clientId);
  if (!item || item.kind !== "blog_draft") {
    return { ok: false, message: tx("queueItemNotFound") };
  }
  const { articleLocale, buildBlogMarkdown, slugify } = await import("@/lib/blog-export");
  const input = {
    title: item.title,
    body: item.body,
    payload: item.payloadJson,
    date: item.generatedAt,
  };
  const locale = articleLocale(input);
  const messages = (
    locale === "fr"
      ? await import("../../../../../messages/fr.json")
      : await import("../../../../../messages/en.json")
  ).default;
  const { createTranslator } = await import("next-intl");
  const t = createTranslator({ locale, messages, namespace: "ui.blog_export" });
  const content = buildBlogMarkdown(
    input,
    {
      untitled: t("untitled"),
      defaultBrief: t("defaultBrief"),
      briefHeading: t("briefHeading"),
      focusKeywords: t("focusKeywords"),
    },
    { forAi },
  );
  const filename = `${slugify(item.title ?? "") || "draft"}${forAi ? "-ai" : ""}.md`;
  return { ok: true, filename, content };
}
