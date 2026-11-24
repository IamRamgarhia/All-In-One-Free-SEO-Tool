import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, contentPosts, publishQueue } from "@/db/schema";

vi.mock("next-intl/server", () => ({
  getLocale: async () => "fr",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const notified: { title: string; body: string }[] = [];
vi.mock("@/lib/notifier", () => ({
  notify: async (n: { title: string; body: string }) => {
    notified.push(n);
    return { ok: true, status: 200, kind: "generic" };
  },
}));

const { decideArticle, decideQueueItem } = await import("./review-actions");

const TOKEN = "review-test-token-0123456789";
const OTHER_TOKEN = "review-other-token-0123456789";

async function queueItem(clientId: number, sent: boolean, title = "Brouillon") {
  const [row] = await db
    .insert(publishQueue)
    .values({
      clientId,
      kind: "gbp_post",
      title,
      body: "Texte de la publication.",
      scheduledFor: new Date(),
      clientSharedAt: sent ? new Date() : null,
    })
    .returning({ id: publishQueue.id });
  return row.id;
}

async function readItem(id: number) {
  const [row] = await db.select().from(publishQueue).where(eq(publishQueue.id, id));
  return row;
}

describe("portal review actions", () => {
  let clientId = 0;
  let otherId = 0;
  beforeAll(async () => {
    clientId = (
      await db.insert(clients).values({ name: "Relecture SA", url: "https://relecture.example", shareToken: TOKEN }).returning({ id: clients.id })
    )[0].id;
    otherId = (
      await db.insert(clients).values({ name: "Autre SA", url: "https://autre.example", shareToken: OTHER_TOKEN }).returning({ id: clients.id })
    )[0].id;
  });

  it("refuses a link that belongs to no client", async () => {
    const id = await queueItem(clientId, true);
    expect(await decideQueueItem("wrong-token-0123456789abc", id, "approved")).toEqual({ ok: false, error: "notFound" });
    expect(await decideQueueItem("short", id, "approved")).toEqual({ ok: false, error: "invalid" });
    expect((await readItem(id)).clientDecision).toBeNull();
  });

  it("refuses another client's item, even when it was sent", async () => {
    const id = await queueItem(otherId, true);
    expect(await decideQueueItem(TOKEN, id, "approved")).toEqual({ ok: false, error: "notFound" });
    const row = await readItem(id);
    expect(row.status).toBe("pending_review");
    expect(row.clientDecision).toBeNull();
  });

  it("refuses an item that was not sent to the client", async () => {
    const id = await queueItem(clientId, false);
    expect(await decideQueueItem(TOKEN, id, "approved")).toEqual({ ok: false, error: "notFound" });
    expect((await readItem(id)).status).toBe("pending_review");
  });

  it("approving hands the item to the publisher, and tells the agency", async () => {
    const id = await queueItem(clientId, true, "Publication Google de mars");
    const before = notified.length;
    expect(await decideQueueItem(TOKEN, id, "approved")).toEqual({ ok: true });
    const row = await readItem(id);
    expect(row.status).toBe("approved");
    expect(row.clientDecision).toBe("approved");
    expect(row.clientDecidedAt).toBeInstanceOf(Date);
    expect(notified.length).toBe(before + 1);
    expect(notified.at(-1)!.body).toBe("Publication Google de mars");
  });

  it("records one answer only", async () => {
    const id = await queueItem(clientId, true);
    expect(await decideQueueItem(TOKEN, id, "changes", "Préciser la zone desservie.")).toEqual({ ok: true });
    expect(await decideQueueItem(TOKEN, id, "approved")).toEqual({ ok: false, error: "answered" });
    const row = await readItem(id);
    expect(row.status).toBe("pending_review");
    expect(row.clientDecision).toBe("changes");
    expect(row.clientComment).toBe("Préciser la zone desservie.");
  });

  it("does not answer for an item the agency already settled", async () => {
    const id = await queueItem(clientId, true);
    await db.update(publishQueue).set({ status: "skipped" }).where(eq(publishQueue.id, id));
    expect(await decideQueueItem(TOKEN, id, "approved")).toEqual({ ok: false, error: "answered" });
    expect((await readItem(id)).status).toBe("skipped");
  });

  it("asks for a comment with a request for changes", async () => {
    const id = await queueItem(clientId, true);
    expect(await decideQueueItem(TOKEN, id, "changes")).toEqual({ ok: false, error: "comment" });
    expect(await decideQueueItem(TOKEN, id, "changes", "   ")).toEqual({ ok: false, error: "comment" });
    expect(await decideQueueItem(TOKEN, id, "changes", "x".repeat(1001))).toEqual({ ok: false, error: "invalid" });
    expect((await readItem(id)).clientDecision).toBeNull();
  });

  it("records the answer on an article without publishing it", async () => {
    const [post] = await db
      .insert(contentPosts)
      .values({ clientId, status: "draft", title: "Article", draftMarkdown: "Texte", reviewSharedAt: new Date() })
      .returning({ id: contentPosts.id });
    const [hidden] = await db
      .insert(contentPosts)
      .values({ clientId, status: "draft", title: "Non envoyé", draftMarkdown: "Texte" })
      .returning({ id: contentPosts.id });

    expect(await decideArticle(TOKEN, hidden.id, "approved")).toEqual({ ok: false, error: "notFound" });
    expect(await decideArticle(OTHER_TOKEN, post.id, "approved")).toEqual({ ok: false, error: "notFound" });
    expect(await decideArticle(TOKEN, post.id, "changes", "")).toEqual({ ok: false, error: "comment" });
    expect(await decideArticle(TOKEN, post.id, "approved")).toEqual({ ok: true });
    expect(await decideArticle(TOKEN, post.id, "changes", "Trop tard")).toEqual({ ok: false, error: "answered" });

    const [row] = await db.select().from(contentPosts).where(eq(contentPosts.id, post.id));
    expect(row.clientDecision).toBe("approved");
    expect(row.status).toBe("draft");
  });
});
